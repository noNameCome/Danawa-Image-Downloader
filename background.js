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
        await processProduct(task.pcode, task.url);
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
    
    // 썸네일 이미지 다운로드
    for (let i = 1; i <= 5; i++) {
        const baseUrl = `https://img.danawa.com/prod_img/500000/${pcode.slice(-3)}/${pcode.slice(-6, -3)}/img/${pcode}_${i}.jpg`;
        const filename = `danawa_images/${folderName}/image_${i}_500px.jpg`;
        
        await downloadImage(baseUrl + '?shrink=500', filename);
    }

    // 상세 이미지 다운로드
    broadcastLog('상세 이미지를 가져오는 중...');
    const detailImages = await getDetailImages(pcode);
    
    if (detailImages && detailImages.length > 0) {
        broadcastLog(`${detailImages.length}개의 상세 이미지를 찾았습니다.`);
        
        for (let i = 0; i < detailImages.length; i++) {
            const filename = `danawa_images/${folderName}/상세페이지_${i + 1}.jpg`;
            await downloadImage(detailImages[i], filename);
        }
    } else {
        broadcastLog('상세 이미지를 찾지 못했습니다.');
    }

    broadcastLog('모든 다운로드가 완료되었습니다.');
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
            
            await chrome.downloads.download({
                url: dataUrl,
                filename: filename,
                saveAs: false
            });
            
            broadcastLog(`다운로드 완료: ${filename}`);
            return true;
        }
        broadcastLog(`다운로드 실패: ${filename} (응답 상태: ${response.status})`);
        return false;
    } catch (e) {
        broadcastLog(`다운로드 오류: ${filename} (${e.message})`);
        return false;
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
            // 이미 큐에 있는지 확인
            if (!downloadQueue.some(task => task.pcode === msg.pcode)) {
                downloadQueue.push({ pcode: msg.pcode, url: msg.url });
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