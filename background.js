let downloadQueue = [];
let isProcessing = false;
let ports = new Set();  // 연결된 포트들을 관리

// 로그 전송 함수
function broadcastLog(message) {
    console.log(message);  // 디버깅용 콘솔 로그
    // 모든 연결된 포트에 메시지 전송
    ports.forEach(port => {
        try {
            port.postMessage({ type: 'log', message });
        } catch (e) {
            // 연결이 끊긴 포트는 제거
            ports.delete(port);
        }
    });
}

// 다운로드 큐 처리
async function processQueue() {
    if (isProcessing || downloadQueue.length === 0) return;
    
    isProcessing = true;
    const task = downloadQueue[0];
    
    try {
        // 사이트 타입에 따라 다른 처리
        if (task.site === 'compuzone') {
            await processCompuzoneProduct(task.url);
        } else {
            // 다나와
            await processProduct(task.pcode, task.url);
        }
    } catch (e) {
        console.error('Download error:', e);
        broadcastLog(`다운로드 오류: ${e.message}`);
    }
    
    downloadQueue.shift();
    isProcessing = false;
    
    if (downloadQueue.length > 0) {
        processQueue();
    }
}

// 제품명 추출 함수
async function getProductTitle(pcode, url) {
    try {
        // URL이 제공된 경우 해당 URL 사용, 아니면 pcode로 URL 생성
        const targetUrl = url || `https://prod.danawa.com/info/?pcode=${pcode}`;
        
        broadcastLog('제품명을 가져오는 중...');
        
        // 새 탭 생성
        const tab = await chrome.tabs.create({
            url: targetUrl,
            active: false
        });
        
        // 페이지 로딩 대기
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 제품명 추출
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const titleElement = document.querySelector('h3.prod_tit span.title');
                return titleElement ? titleElement.textContent.trim() : null;
            }
        });
        
        // 탭 닫기
        await chrome.tabs.remove(tab.id);
        
        const productTitle = results[0].result;
        
        if (productTitle) {
            // 파일명으로 사용할 수 없는 문자 제거
            const sanitizedTitle = productTitle.replace(/[\\/:*?"<>|]/g, '').trim();
            broadcastLog(`제품명: ${sanitizedTitle}`);
            return sanitizedTitle;
        }
        
        return null;
    } catch (e) {
        broadcastLog(`제품명 가져오기 오류: ${e.message}`);
        return null;
    }
}

// 상품 처리 함수
async function processProduct(pcode, url = null) {
    broadcastLog(`상품 코드 ${pcode} 처리 중...`);
    
    // 제품명 추출
    let folderName = pcode;  // 기본값은 pcode
    const productTitle = await getProductTitle(pcode, url);
    
    if (productTitle) {
        folderName = productTitle;
    } else {
        broadcastLog('제품명을 가져오지 못했습니다. pcode를 폴더명으로 사용합니다.');
    }
    
    let folderOpened = false; // 폴더를 이미 열었는지 추적
    
    // 썸네일 이미지 다운로드
    for (let i = 1; i <= 5; i++) {
        const baseUrl = `https://img.danawa.com/prod_img/500000/${pcode.slice(-3)}/${pcode.slice(-6, -3)}/img/${pcode}_${i}.jpg`;
        const filename = `danawa_images/${folderName}/image_${i}_500px.jpg`;
        
        const downloadId = await downloadImage(baseUrl + '?shrink=500', filename);
        
        // 첫 번째 성공한 다운로드 후 바로 폴더 열기
        if (downloadId && !folderOpened) {
            folderOpened = true;
            // 폴더 열기를 비동기로 실행 (다운로드 계속 진행)
            openDownloadFolder(downloadId);
        }
    }

    // 상세 이미지 다운로드
    broadcastLog('상세 이미지를 가져오는 중...');
    const detailImages = await getDetailImages(pcode);
    
    if (detailImages && detailImages.length > 0) {
        broadcastLog(`${detailImages.length}개의 상세 이미지를 찾았습니다.`);
        
        for (let i = 0; i < detailImages.length; i++) {
            const filename = `danawa_images/${folderName}/상세페이지_${i + 1}.jpg`;
            const downloadId = await downloadImage(detailImages[i], filename);
            
            // 혹시 썸네일이 모두 실패했다면 여기서라도 폴더 열기
            if (downloadId && !folderOpened) {
                folderOpened = true;
                openDownloadFolder(downloadId);
            }
        }
    } else {
        broadcastLog('상세 이미지를 찾지 못했습니다.');
    }

    broadcastLog('모든 다운로드가 완료되었습니다.');
}

// 다운로드 폴더 열기 (비동기 실행)
async function openDownloadFolder(downloadId) {
    try {
        // 다운로드가 시작되고 파일이 생성될 때까지 잠시 대기
        await waitForDownloadComplete(downloadId);
        // 파일 탐색기에서 다운로드 폴더 열기
        await chrome.downloads.show(downloadId);
        broadcastLog('📁 다운로드 폴더를 열었습니다.');
    } catch (e) {
        console.error('폴더 열기 오류:', e);
    }
}

// 다운로드 완료 대기 함수
async function waitForDownloadComplete(downloadId) {
    return new Promise((resolve) => {
        const checkInterval = setInterval(async () => {
            try {
                const [download] = await chrome.downloads.search({ id: downloadId });
                if (download && download.state === 'complete') {
                    clearInterval(checkInterval);
                    resolve();
                } else if (download && download.state === 'interrupted') {
                    clearInterval(checkInterval);
                    resolve(); // 실패해도 진행
                }
            } catch (e) {
                clearInterval(checkInterval);
                resolve();
            }
        }, 100); // 100ms마다 체크
    });
}

// 이미지 다운로드 함수
async function downloadImage(url, filename) {
    try {
        broadcastLog(`다운로드 시도: ${filename}`);
        const response = await fetch(url);
        if (response.ok) {
            // 이미지 데이터를 Base64로 변환
            const buffer = await response.arrayBuffer();
            const base64 = btoa(
                new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
            );
            const dataUrl = `data:${response.headers.get('content-type') || 'image/jpeg'};base64,${base64}`;
            
            const downloadId = await chrome.downloads.download({
                url: dataUrl,
                filename: filename,
                saveAs: false
            });
            
            broadcastLog(`다운로드 완료: ${filename}`);
            return downloadId; // 다운로드 ID 반환
        }
        broadcastLog(`다운로드 실패: ${filename} (응답 상태: ${response.status})`);
        return null;
    } catch (e) {
        broadcastLog(`다운로드 오류: ${filename} (${e.message})`);
        return null;
    }
}

// 상세 이미지 가져오기 함수
async function getDetailImages(pcode) {
    try {
        // 새 탭 생성
        const tab = await chrome.tabs.create({
            url: `https://prod.danawa.com/info/?pcode=${pcode}`,
            active: false
        });
        
        // 페이지 로딩 대기
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // 이미지 추출
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                // "상품정보 더보기" 버튼 클릭 시도
                try {
                    const moreButton = document.querySelector('button.btn_more, button.btn_more_detail');
                    if (moreButton) {
                        moreButton.click();
                    }
                } catch (e) {
                    console.error('더보기 버튼 클릭 실패:', e);
                }
                
                // 이미지 수집
                const images = document.querySelectorAll('.detail_cont img, .detail_cont a img, .prod_detail img, .prod_detail a img, .detail_cont div img, .prod_detail div img');
                return Array.from(images)
                    .map(img => img.src || img.dataset.src)
                    .filter(src => src && (src.includes('add_1') || src.includes('prod_img')))
                    .map(src => src.startsWith('//') ? 'https:' + src : src);
            }
        });
        
        // 탭 닫기
        await chrome.tabs.remove(tab.id);
        
        return results[0].result;
    } catch (e) {
        broadcastLog(`상세 이미지 가져오기 오류: ${e.message}`);
        return [];
    }
}

// 포트 연결 리스너
chrome.runtime.onConnect.addListener(port => {
    // 새 포트 추가
    ports.add(port);
    
    // 포트 메시지 리스너
    port.onMessage.addListener(msg => {
        if (msg.type === 'download') {
            // 사이트 타입에 따라 중복 체크
            const isDuplicate = msg.site === 'compuzone' 
                ? downloadQueue.some(task => task.url === msg.url && task.site === 'compuzone')
                : downloadQueue.some(task => task.pcode === msg.pcode);
            
            if (!isDuplicate) {
                downloadQueue.push({ 
                    pcode: msg.pcode, 
                    url: msg.url,
                    site: msg.site || 'danawa'
                });
                processQueue();
            } else {
                broadcastLog('이미 다운로드 큐에 있는 상품입니다.');
            }
        }
    });
    
    // 포트 연결 해제 리스너
    port.onDisconnect.addListener(() => {
        ports.delete(port);
    });
});

// ===== 컴퓨존 제품 처리 함수 =====
async function processCompuzoneProduct(url) {
    try {
        broadcastLog(`컴퓨존 상품 처리 중: ${url}`);
        
        // 기존에 열려있는 탭 찾기
        const existingTabs = await chrome.tabs.query({ url: url });
        let tab;
        let isNewTab = false;  // 새로 만든 탭인지 플래그
        
        if (existingTabs.length > 0) {
            // 이미 열려있는 탭이 있으면 그 탭 사용
            tab = existingTabs[0];
            broadcastLog('기존 탭 사용 중...');
            // 탭 활성화
            await chrome.tabs.update(tab.id, { active: true });
            // 페이지 새로고침 (최신 상태로)
            await chrome.tabs.reload(tab.id);
        } else {
            // 새 탭 생성 (활성화 상태로 - lazy loading 이미지 로드를 위해)
            tab = await chrome.tabs.create({
                url: url,
                active: true  // 탭을 활성화해야 상세 이미지가 로드됨
            });
            isNewTab = true;  // 새로 만든 탭임을 표시
        }
        
        // 페이지 로딩 대기
        broadcastLog('페이지 로딩 중... (7초)');
        await new Promise(resolve => setTimeout(resolve, 7000));
        
        // 상세 탭 클릭 및 스크롤
        broadcastLog('상세 정보 활성화 중...');
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                // 상세정보 탭/버튼 클릭
                const detailButtons = document.querySelectorAll('a, button, li, div');
                for (const btn of detailButtons) {
                    const text = btn.textContent || '';
                    if (text.includes('상세정보') || text.includes('상세제원') || text.includes('제품상세')) {
                        btn.click();
                        break;
                    }
                }
                // 상세 영역 강제 표시
                const detailDiv = document.querySelector('#pdtl_detail_img');
                if (detailDiv) {
                    detailDiv.style.display = 'block';
                    detailDiv.style.visibility = 'visible';
                }
            }
        });
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 스크롤: 끝 → 위 → 끝 (즉시)
        broadcastLog('페이지 활성화 중...');
        
        // 1. 끝까지 스크롤
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => { window.scrollTo(0, document.body.scrollHeight); }
        });
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 2. 맨 위로 스크롤
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => { window.scrollTo(0, 0); }
        });
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 3. 다시 끝까지 스크롤
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => { window.scrollTo(0, document.body.scrollHeight); }
        });
        
        // 이미지 로드 대기
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 이미지 및 제품명 추출
        broadcastLog('이미지 추출 중...');
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const images = [];
                
                // 제품명 추출
                let productTitle = '';
                const titleElement = document.querySelector('h2.tit_p_name');
                if (titleElement) {
                    productTitle = titleElement.textContent.trim();
                }
                
                // 메인 이미지 추출
                const mainImages = document.querySelectorAll('.main_img .lst li img');
                mainImages.forEach((img) => {
                    const src = img.src;
                    if (src) {
                        images.push({ type: 'main', url: src });
                    }
                });
                
                // pdtl_detail_img div 안의 모든 이미지 가져오기
                const detailDiv = document.querySelector('#pdtl_detail_img');
                console.log('상세 div 찾음:', !!detailDiv);
                
                if (detailDiv) {
                    const detailImgs = detailDiv.querySelectorAll('img');
                    console.log('상세 div 안의 img 개수:', detailImgs.length);
                    
                    detailImgs.forEach((img, index) => {
                        let src = img.src || img.getAttribute('data-src') || img.getAttribute('data-original');
                        
                        // // 로 시작하는 경우 https: 붙이기
                        if (src && src.startsWith('//')) {
                            src = 'https:' + src;
                        }
                        
                        console.log(`상세 이미지 ${index + 1}:`, src);
                        
                        // 일단 모든 이미지 가져오기 (디버깅)
                        if (src && !images.some(i => i.url === src)) {
                            images.push({ type: 'detail', url: src });
                        }
                    });
                } else {
                    console.log('⚠️ 상세 이미지 div를 찾을 수 없습니다!');
                }
                
                return {
                    productTitle: productTitle,
                    images: images
                };
            }
        });
        
        // 새로 만든 탭만 닫기 (기존 탭은 유지)
        if (isNewTab) {
            await chrome.tabs.remove(tab.id);
            broadcastLog('탭 닫기 완료');
        } else {
            broadcastLog('기존 탭 유지');
        }
        
        const result = results[0].result;
        const productTitle = result.productTitle;
        const imageList = result.images;
        
        // 폴더명 생성
        let folderName = 'compuzone_product';
        if (productTitle) {
            folderName = productTitle.replace(/[\\/:*?"<>|]/g, '').trim();
            broadcastLog(`제품명: ${productTitle}`);
        } else {
            broadcastLog('제품명을 가져오지 못했습니다. 기본 폴더명을 사용합니다.');
        }
        
        broadcastLog(`총 ${imageList.length}개의 이미지를 다운로드합니다.`);
        
        let folderOpened = false;
        let mainCount = 0;
        let detailCount = 0;
        
        // 이미지 다운로드
        for (let i = 0; i < imageList.length; i++) {
            const img = imageList[i];
            let filename;
            
            if (img.type === 'main') {
                mainCount++;
                filename = `compuzone_images/${folderName}/메인_${mainCount}.jpg`;
            } else {
                detailCount++;
                filename = `compuzone_images/${folderName}/상세_${detailCount}.jpg`;
            }
            
            const downloadId = await downloadImage(img.url, filename);
            
            // 첫 번째 성공한 다운로드 후 바로 폴더 열기
            if (downloadId && !folderOpened) {
                folderOpened = true;
                openDownloadFolder(downloadId);
            }
        }
        
        broadcastLog(`메인 이미지: ${mainCount}개, 상세 이미지: ${detailCount}개`);
        broadcastLog('모든 다운로드가 완료되었습니다.');
        
    } catch (e) {
        broadcastLog(`컴퓨존 다운로드 오류: ${e.message}`);
        console.error('컴퓨존 처리 오류:', e);
    }
}
