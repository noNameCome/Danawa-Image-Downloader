import os
import re
import requests
from urllib.parse import urlparse, parse_qs
from tkinter import Tk, Label, Button, Text, END, Scrollbar, RIGHT, Y, Frame, LEFT, font, ttk, DoubleVar
from bs4 import BeautifulSoup
import threading
from selenium import webdriver
from selenium.webdriver.chrome.service import Service as ChromeService
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException
import subprocess
import sys

class DanawaImageDownloader:
    def __init__(self):
        self.root = Tk()
        self.root.title("다나와 이미지 다운로더 By noName_Come")
        self.root.geometry("400x500")
        self.root.resizable(False, False)
        
        # 아이콘 설정
        try:
            if getattr(sys, 'frozen', False):
                # PyInstaller로 만든 실행 파일일 경우
                base_path = sys._MEIPASS
            else:
                # 일반 Python 스크립트로 실행할 경우
                base_path = os.path.abspath(os.path.dirname(__file__))
            
            icon_path = os.path.join(base_path, 'icon.ico')
            self.root.iconbitmap(default=icon_path)
            self.root.wm_iconbitmap(icon_path)
        except Exception as e:
            print(f"Icon load error: {e}")
            pass
        
        # 스타일 설정
        self.style = {
            'bg_color': '#2b2b2b',
            'text_color': '#ffffff',
            'button_bg': '#404040',
            'button_fg': '#ffffff',
            'button_active_bg': '#505050',
            'input_bg': '#363636',
            'input_fg': '#ffffff',
            'font_family': 'Segoe UI',
            'title_font_size': 12,
            'text_font_size': 10,
            'button_font_size': 10
        }
        
        # ttk 스타일 설정
        self.style_ttk = ttk.Style()
        self.style_ttk.configure(
            "Custom.Horizontal.TProgressbar",
            troughcolor=self.style['input_bg'],
            background=self.style['button_bg'],
            darkcolor=self.style['button_bg'],
            lightcolor=self.style['button_bg'],
            bordercolor=self.style['input_bg']
        )
        
        # 기본 폰트 설정
        self.default_font = font.nametofont("TkDefaultFont")
        self.default_font.configure(family=self.style['font_family'], size=self.style['text_font_size'])
        
        # 창 배경색 설정
        self.root.configure(bg=self.style['bg_color'])
        
        # 메인 프레임
        main_frame = Frame(self.root, bg=self.style['bg_color'])
        main_frame.pack(expand=True, fill='both', padx=20, pady=20)
        
        # 제목
        title_label = Label(
            main_frame,
            text="다나와 이미지 다운로더",
            font=(self.style['font_family'], self.style['title_font_size'], 'bold'),
            bg=self.style['bg_color'],
            fg=self.style['text_color']
        )
        title_label.pack(pady=(0, 20))
        
        # URL 입력 영역
        input_frame = Frame(main_frame, bg=self.style['bg_color'])
        input_frame.pack(fill='x', pady=(0, 10))
        
        Label(
            input_frame,
            text="다나와 상품 URL 또는 상품 번호를 입력하세요",
            font=(self.style['font_family'], self.style['text_font_size']),
            bg=self.style['bg_color'],
            fg=self.style['text_color']
        ).pack(anchor='w')
        
        Label(
            input_frame,
            text="(여러 개인 경우 줄바꿈으로 구분)",
            font=(self.style['font_family'], self.style['text_font_size']),
            bg=self.style['bg_color'],
            fg=self.style['text_color']
        ).pack(anchor='w', pady=(0, 5))
        
        # URL 입력 텍스트 영역
        self.url_text = Text(
            input_frame,
            height=3,
            width=40,
            font=(self.style['font_family'], self.style['text_font_size']),
            bg=self.style['input_bg'],
            fg=self.style['input_fg'],
            insertbackground=self.style['text_color'],
            relief='flat',
            padx=10,
            pady=5
        )
        self.url_text.pack(fill='x', pady=(0, 10))
        
        # 버튼 프레임
        button_frame = Frame(main_frame, bg=self.style['bg_color'])
        button_frame.pack(fill='x', pady=(0, 10))
        
        # 버튼을 담을 내부 프레임 (가운데 정렬용)
        button_container = Frame(button_frame, bg=self.style['bg_color'])
        button_container.pack(expand=True)
        
        # 다운로드 버튼
        Button(
            button_container,
            text="이미지 다운로드",
            command=self.start_download,
            font=(self.style['font_family'], self.style['button_font_size']),
            bg=self.style['button_bg'],
            fg=self.style['button_fg'],
            activebackground=self.style['button_active_bg'],
            activeforeground=self.style['button_fg'],
            relief='flat',
            padx=20,
            pady=5
        ).pack(side=LEFT, padx=(0, 5))
        
        # 폴더 열기 버튼
        Button(
            button_container,
            text="폴더 열기",
            command=self.open_folder,
            font=(self.style['font_family'], self.style['button_font_size']),
            bg=self.style['button_bg'],
            fg=self.style['button_fg'],
            activebackground=self.style['button_active_bg'],
            activeforeground=self.style['button_fg'],
            relief='flat',
            padx=20,
            pady=5
        ).pack(side=LEFT)
        
        # 프로그레스 바 프레임
        progress_frame = Frame(main_frame, bg=self.style['bg_color'])
        progress_frame.pack(fill='x', pady=(0, 10))
        
        # 프로그레스 바
        self.progress_var = DoubleVar()
        self.progress_bar = ttk.Progressbar(
            progress_frame,
            variable=self.progress_var,
            maximum=100,
            style="Custom.Horizontal.TProgressbar",
            mode='determinate'
        )
        self.progress_bar.pack(fill='x')
        
        # 진행 상태 레이블
        self.progress_label = Label(
            progress_frame,
            text="",
            font=(self.style['font_family'], self.style['text_font_size']),
            bg=self.style['bg_color'],
            fg=self.style['text_color']
        )
        self.progress_label.pack(pady=(5, 0))
        
        # 로그 출력 영역
        log_frame = Frame(main_frame, bg=self.style['bg_color'])
        log_frame.pack(fill='both', expand=True)
        
        self.log_text = Text(
            log_frame,
            height=15,
            width=40,
            font=(self.style['font_family'], self.style['text_font_size']),
            bg=self.style['input_bg'],
            fg=self.style['text_color'],
            insertbackground=self.style['text_color'],
            relief='flat',
            padx=10,
            pady=5
        )
        self.log_text.pack(fill='both', expand=True)
        
        # 마우스 스크롤 이벤트 바인딩
        self.log_text.bind('<MouseWheel>', lambda e: self.log_text.yview_scroll(int(-1*(e.delta/120)), "units"))
        self.log_text.bind('<Button-4>', lambda e: self.log_text.yview_scroll(-1, "units"))
        self.log_text.bind('<Button-5>', lambda e: self.log_text.yview_scroll(1, "units"))
        
        # URL 입력 텍스트 영역에도 마우스 스크롤 적용
        self.url_text.bind('<MouseWheel>', lambda e: self.url_text.yview_scroll(int(-1*(e.delta/120)), "units"))
        self.url_text.bind('<Button-4>', lambda e: self.url_text.yview_scroll(-1, "units"))
        self.url_text.bind('<Button-5>', lambda e: self.url_text.yview_scroll(1, "units"))
        
        # 다운로드 폴더 생성
        self.base_folder = "danawa_images"
        os.makedirs(self.base_folder, exist_ok=True)
        
        # HTTP 세션 초기화
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        })
        
        # Selenium 웹드라이버 초기화
        self.driver = None
        
        # 마지막으로 다운로드한 상품 폴더 경로
        self.last_download_folder = None
        
        # 다운로드 진행 상태
        self.total_images = 0
        self.downloaded_images = 0
        
    def log(self, message):
        """로그 메시지를 추가하고 자동으로 스크롤"""
        self.log_text.insert(END, message + "\n")
        self.log_text.see(END)
        self.root.update_idletasks()
        
    def init_selenium(self):
        if self.driver is None:
            try:
                self.log("ChromeDriver 버전 확인 중...")
                
                options = webdriver.ChromeOptions()
                options.add_argument('--headless')
                options.add_argument('--disable-gpu')
                options.add_argument('--no-sandbox')
                options.add_argument('--disable-dev-shm-usage')
                options.add_argument('--blink-settings=imagesEnabled=false')
                options.add_argument('--disable-extensions')
                options.add_argument('--disable-logging')
                options.add_argument('--log-level=3')
                options.add_argument('--silent')
                options.add_argument('--disable-notifications')
                options.add_argument('--disable-popup-blocking')
                options.add_argument('--disable-infobars')
                options.add_argument('--disable-web-security')
                options.add_argument('--disable-features=IsolateOrigins,site-per-process')
                
                service = ChromeService(ChromeDriverManager().install())
                self.driver = webdriver.Chrome(service=service, options=options)
                self.driver.set_page_load_timeout(30)
                
                self.log("ChromeDriver 초기화 완료")
                
            except Exception as e:
                self.log(f"ChromeDriver 초기화 오류: {str(e)}")
                self.driver = None
            
    def close_selenium(self):
        if self.driver:
            try:
                self.driver.quit()
            except:
                pass
            finally:
                self.driver = None
            
    def download_image_parallel(self, url, folder, filename):
        try:
            response = self.session.get(url, timeout=10)
            if response.status_code == 200:
                filepath = os.path.join(folder, filename)
                with open(filepath, "wb") as f:
                    f.write(response.content)
                return True
            return False
        except Exception as e:
            self.log(f"Error downloading {url}: {str(e)}")
            return False
            
    def extract_pcode(self, text):
        if text.isdigit():
            return text
        try:
            query = urlparse(text).query
            params = parse_qs(query)
            pcode = params.get("pcode", [None])[0]
            if pcode and pcode.isdigit():
                return pcode
        except:
            pass
        return None
        
    def is_direct_image_url(self, url):
        return ('iws.danawa.com' in url or 'img.danawa.com' in url) and url.endswith('.jpg')
        
    def get_product_images(self, pcode):
        try:
            # 대기 메시지 표시
            self.progress_label.config(text="잠시만 기다려주세요... 이미지를 찾는 중입니다.")
            self.root.update_idletasks()
            
            # 1. 썸네일 이미지 URL 생성
            thumbnail_urls = []
            for i in range(1, 6):
                base_url = f"https://img.danawa.com/prod_img/500000/{pcode[-3:]}/{pcode[-6:-3]}/img/{pcode}_{i}.jpg"
                thumbnail_urls.append({
                    '500px': f"{base_url}?shrink=500",
                    '890px': f"{base_url}?shrink=890",
                    'original': base_url
                })
                self.log(f"Generated thumbnail URL: {base_url}")
            
            # 2. 상세페이지 이미지 URL 생성
            self.init_selenium()
            if not self.driver:
                return thumbnail_urls
                
            url = f"https://prod.danawa.com/info/?pcode={pcode}"
            self.driver.get(url)
            
            # "상품정보 더보기" 버튼 클릭
            try:
                more_button = WebDriverWait(self.driver, 5).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, "button.btn_more"))
                )
                more_button.click()
                self.log("Clicked '상품정보 더보기' button")
                
                # 추가 콘텐츠가 로드될 때까지 대기
                WebDriverWait(self.driver, 5).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, ".detail_cont"))
                )
            except TimeoutException:
                self.log("No '상품정보 더보기' button found or timeout")
            
            # 페이지 소스 가져오기
            page_source = self.driver.page_source
            soup = BeautifulSoup(page_source, 'html.parser')
            
            # 상세페이지에서 이미지 찾기
            detail_images = soup.select('.detail_cont img, .detail_cont a img, .prod_detail img, .prod_detail a img, .detail_cont div img, .prod_detail div img')
            self.log(f"Found {len(detail_images)} detail images")
            
            detail_urls = []
            for img in detail_images:
                src = img.get('src', '') or img.get('data-src', '')
                if src and ('add_1' in src or 'prod_img' in src):
                    if src.startswith('//'):
                        src = 'https:' + src
                    elif src.startswith('/'):
                        src = 'https://prod.danawa.com' + src
                        
                    if src.endswith('.jpg'):
                        base_url = src.split('?')[0]
                        detail_urls.append({
                            '500px': f"{base_url}?shrink=500",
                            '890px': f"{base_url}?shrink=890",
                            'original': base_url
                        })
                        self.log(f"Found detail image URL: {base_url}")
            
            return thumbnail_urls + detail_urls
            
        except Exception as e:
            self.log(f"Error fetching images from page: {str(e)}")
            return thumbnail_urls
        finally:
            self.close_selenium()
            # 대기 메시지 초기화
            self.progress_label.config(text="")
            self.root.update_idletasks()
            
    def process_direct_image_url(self, url):
        try:
            # Extract pcode from URL if possible
            pcode = None
            if '/prod_' in url:
                pcode_match = re.search(r'/prod_(\d+)/', url)
                if pcode_match:
                    pcode = pcode_match.group(1)
            
            # Create folder
            if pcode:
                product_folder = os.path.join(self.base_folder, pcode)
            else:
                product_folder = os.path.join(self.base_folder, "direct")
            os.makedirs(product_folder, exist_ok=True)
            
            # Get base URL without parameters
            base_url = url.split('?')[0]
            
            # Download both sizes
            filename = os.path.basename(base_url)
            filename_500 = f"{os.path.splitext(filename)[0]}_500px.jpg"
            filename_890 = f"{os.path.splitext(filename)[0]}_890px.jpg"
            
            if self.download_image_parallel(f"{base_url}?shrink=500", product_folder, filename_500):
                self.log(f"Downloaded 500px version of {filename}")
            
            if self.download_image_parallel(f"{base_url}?shrink=890", product_folder, filename_890):
                self.log(f"Downloaded 890px version of {filename}")
                
        except Exception as e:
            self.log(f"Error processing direct image URL: {e}")
            
    def update_progress(self, current, total):
        """프로그레스 바 업데이트"""
        try:
            progress = min((current / total) * 100, 100)
            self.progress_var.set(progress)
            self.progress_label.config(text=f"다운로드 중... {current}/{total} ({progress:.1f}%)")
            self.root.update_idletasks()
        except:
            pass
        
    def process_url(self, url):
        url = url.strip()
        if not url:
            return
            
        if self.is_direct_image_url(url):
            self.log(f"\nProcessing direct image URL: {url}")
            self.process_direct_image_url(url)
            return
            
        pcode = self.extract_pcode(url)
        if not pcode:
            self.log(f"Invalid URL: {url}")
            return
            
        self.log(f"\nProcessing product code: {pcode}")
        
        # Create folder for this product
        product_folder = os.path.join(self.base_folder, pcode)
        os.makedirs(product_folder, exist_ok=True)
        
        # 마지막 다운로드 폴더 업데이트
        self.last_download_folder = product_folder
        
        # Get and download images
        images = self.get_product_images(pcode)
        if not images:
            self.log(f"No images found for product {pcode}")
            return
            
        self.log(f"Found {len(images)} images")
        
        # 다운로드 진행 상태 초기화
        self.total_images = len(images)
        self.downloaded_images = 0
        self.update_progress(0, self.total_images)
        
        # 썸네일 이미지 다운로드 (1-5)
        for i in range(5):  # 0부터 4까지 (5개 이미지)
            if i < len(images):
                filename = f"image_{i+1}_500px.jpg"
                if self.download_image_parallel(images[i]['500px'], product_folder, filename):
                    self.log(f"Downloaded thumbnail image {i+1}")
                else:
                    self.log(f"Failed to download thumbnail image {i+1}")
                self.downloaded_images += 1
                self.update_progress(self.downloaded_images, self.total_images)
        
        # 상세페이지 이미지 다운로드
        if len(images) > 5:  # 6번째 이미지부터는 상세페이지 이미지
            detail_images = images[5:]  # 6번째 이미지부터는 상세페이지 이미지
            for i, img in enumerate(detail_images, 1):
                filename = f"상세페이지_{i}.jpg"
                if self.download_image_parallel(img['original'], product_folder, filename):
                    self.log(f"Downloaded detail page image {i}")
                else:
                    self.log(f"Failed to download detail page image {i}")
                self.downloaded_images += 1
                self.update_progress(self.downloaded_images, self.total_images)
        
        # 다운로드 완료
        self.progress_var.set(100)  # 확실하게 100%로 설정
        self.progress_label.config(text="다운로드 완료!")
        self.root.update_idletasks()
        
    def start_download(self):
        urls = self.url_text.get("1.0", END).strip().split("\n")
        self.log_text.delete("1.0", END)
        self.log("Starting download process...")
        
        # Process URLs in a separate thread to keep GUI responsive
        def download_thread():
            try:
                for url in urls:
                    if url.strip():
                        self.process_url(url)
                self.log("\nDownload process completed!")
            finally:
                self.close_selenium()
                self.session.close()
            
        threading.Thread(target=download_thread, daemon=True).start()
        
    def open_folder(self):
        try:
            if self.last_download_folder and os.path.exists(self.last_download_folder):
                # 마지막으로 다운로드한 상품 폴더가 있으면 해당 폴더 열기
                folder_path = self.last_download_folder
            else:
                # 없으면 기본 다운로드 폴더 열기
                folder_path = os.path.join(os.path.abspath(os.path.dirname(__file__)), self.base_folder)
            
            if os.name == 'nt':  # Windows
                subprocess.run(['explorer', folder_path])
            else:  # macOS 또는 Linux
                subprocess.run(['open', folder_path])
                
            self.log(f"Opened folder: {folder_path}")
        except Exception as e:
            self.log(f"Error opening folder: {str(e)}")
        
    def run(self):
        try:
            self.root.mainloop()
        finally:
            self.close_selenium()
            self.session.close()

if __name__ == "__main__":
    app = DanawaImageDownloader()
    app.run() 