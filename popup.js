document.addEventListener('DOMContentLoaded', function() {
    const urlInput = document.getElementById('urlInput');
    const downloadBtn = document.getElementById('downloadBtn');
    const log = document.getElementById('log');
    
    // 백그라운드 페이지와 연결
    const port = chrome.runtime.connect({ name: 'popup' });
    
    // 로그 메시지 수신
    port.onMessage.addListener(msg => {
        if (msg.type === 'log') {
            log.value += msg.message + '\n';
            log.scrollTop = log.scrollHeight;
        }
    });

    // URL 자동 입력 (현재 탭 우선, 없으면 클립보드) - 다나와/컴퓨존
    let urlChecked = false; // 중복 체크 방지
    
    async function loadUrl() {
        if (urlChecked) return; // 이미 확인했으면 스킵
        urlChecked = true;
        
        if (urlInput.value.trim()) return; // 입력창에 이미 값이 있으면 스킵
        
        try {
            // 1. 먼저 현재 탭 URL 확인
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (activeTab && activeTab.url) {
                if (activeTab.url.includes('danawa.com')) {
                    urlInput.value = activeTab.url;
                    log.value = '✓ 현재 탭에서 다나와 URL을 감지했습니다.\n';
                    return;
                } else if (activeTab.url.includes('compuzone.co.kr')) {
                    urlInput.value = activeTab.url;
                    log.value = '✓ 현재 탭에서 컴퓨존 URL을 감지했습니다.\n';
                    return;
                }
            }
            
            // 2. 현재 탭이 지원 사이트가 아니면 클립보드 확인
            const clipboardText = await navigator.clipboard.readText();
            
            if (clipboardText && clipboardText.trim()) {
                const text = clipboardText.trim();
                if (text.includes('danawa.com')) {
                    urlInput.value = text;
                    log.value = '✓ 클립보드에서 다나와 URL을 감지했습니다.\n';
                } else if (text.includes('compuzone.co.kr')) {
                    urlInput.value = text;
                    log.value = '✓ 클립보드에서 컴퓨존 URL을 감지했습니다.\n';
                }
            }
        } catch (err) {
            console.error('URL 자동 감지 실패:', err);
        }
    }
    
    // 입력창 포커스 시 URL 확인
    urlInput.addEventListener('focus', loadUrl);
    
    // 팝업 로드 후 자동으로 입력창에 포커스
    urlInput.focus();

    // 사이트 타입 감지
    function detectSite(text) {
        if (text.includes('compuzone.co.kr')) {
            return 'compuzone';
        } else if (text.includes('danawa.com')) {
            return 'danawa';
        }
        return null;
    }

    function extractPcode(text) {
        if (/^\d+$/.test(text)) {
            return text;
        }
        try {
            const url = new URL(text);
            const pcode = url.searchParams.get('pcode');
            if (pcode && /^\d+$/.test(pcode)) {
                return pcode;
            }
        } catch (e) {}
        return null;
    }

    downloadBtn.addEventListener('click', () => {
        const input = urlInput.value.trim();
        if (!input) {
            log.value = 'URL 또는 상품 번호를 입력해주세요.\n';
            return;
        }

        // 입력값을 줄바꿈으로 분리하여 배열로 만듦
        const urls = input.split('\n').filter(url => url.trim());
        
        if (urls.length === 0) {
            log.value = 'URL 또는 상품 번호를 입력해주세요.\n';
            return;
        }

        log.value = '';  // 로그 초기화
        downloadBtn.disabled = true;

        // 각 URL 처리
        let validUrls = 0;
        urls.forEach(url => {
            const trimmedUrl = url.trim();
            const site = detectSite(trimmedUrl);
            
            if (site === 'compuzone') {
                // 컴퓨존 URL
                validUrls++;
                port.postMessage({ 
                    type: 'download', 
                    site: 'compuzone',
                    url: trimmedUrl 
                });
            } else if (site === 'danawa') {
                // 다나와 URL 또는 상품 번호
                const pcode = extractPcode(trimmedUrl);
                if (pcode) {
                    validUrls++;
                    const isUrl = trimmedUrl.startsWith('http'); 
                    port.postMessage({ 
                        type: 'download', 
                        site: 'danawa',
                        pcode,
                        url: isUrl ? trimmedUrl : null 
                    });
                } else {
                    log.value += `잘못된 다나와 URL 또는 상품 번호: ${trimmedUrl}\n`;
                }
            } else {
                log.value += `지원하지 않는 URL: ${trimmedUrl}\n`;
            }
        });

        if (validUrls > 0) {
            log.value += `${validUrls}개의 다운로드가 시작되었습니다.\n`;
            log.value += '팝업을 닫아도 다운로드는 계속됩니다.\n';
        } else {
            log.value += '올바른 URL 또는 상품 번호가 없습니다.\n';
            downloadBtn.disabled = false;
        }
    });

    // 텍스트 영역에서 Ctrl+V 이벤트 처리
    urlInput.addEventListener('paste', (e) => {
        // 기본 붙여넣기 동작 허용
        setTimeout(() => {
            // 붙여넣은 후 자동으로 줄바꿈 정리
            const lines = urlInput.value.split('\n').map(line => line.trim()).filter(line => line);
            urlInput.value = lines.join('\n');
        }, 0);
    });

    // Enter 키로 다운로드 실행 (Shift+Enter는 줄바꿈)
    urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault(); // 기본 줄바꿈 방지
            downloadBtn.click(); // 다운로드 버튼 클릭
        }
    });
}); 