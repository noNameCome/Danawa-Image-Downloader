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
            const pcode = extractPcode(trimmedUrl);
            if (pcode) {
                validUrls++;
                // 다운로드 요청을 백그라운드로 전송 (원본 URL도 함께 전달)
                const isUrl = trimmedUrl.startsWith('http');
                port.postMessage({ 
                    type: 'download', 
                    pcode,
                    url: isUrl ? trimmedUrl : null 
                });
            } else {
                log.value += `잘못된 URL 또는 상품 번호: ${trimmedUrl}\n`;
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
}); 