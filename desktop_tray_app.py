import os
import sys
import time
import socket
import argparse
import threading
import subprocess
import webbrowser
import requests
import ctypes
from ctypes import wintypes
from PIL import Image
import webview
import pystray

# --- Edge WebView2의 강제 HTTPS 업그레이드(Automatic HTTPS/HSTS) 및 SSL 에러 방지 ---
os.environ["WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS"] = (
    "--disable-features=EdgeAutomaticHttps,AutomaticHttps,msSmartScreenProtection "
    "--ignore-certificate-errors"
)
# --- Windows 작업 표시줄 독립 앱 등록 및 AppUserModelID 지정 ---
try:
    ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("MyAsset.DesktopApp.1.0")
except Exception:
    pass

def set_app_icon(hwnd, icon_path):
    if not hwnd or not os.path.exists(icon_path):
        return
    try:
        IMAGE_ICON = 1
        LR_LOADFROMFILE = 0x00000010
        WM_SETICON = 0x0080
        ICON_SMALL = 0
        ICON_BIG = 1
        user32 = ctypes.windll.user32
        hicon = user32.LoadImageW(None, icon_path, IMAGE_ICON, 0, 0, LR_LOADFROMFILE)
        if hicon:
            user32.SendMessageW(hwnd, WM_SETICON, ICON_BIG, hicon)
            user32.SendMessageW(hwnd, WM_SETICON, ICON_SMALL, hicon)
    except Exception:
        pass

# --- 단일 인스턴스 보장 (Windows Named Mutex & Win32 Window Focus) ---
MUTEX_HANDLE = None

def check_single_instance(mutex_name="Global\\MyAssetDesktopAppMutex"):
    """
    Windows Named Mutex를 생성하여 이미 인스턴스가 실행 중인지 확인합니다.
    이미 실행 중이면 기존 창을 맨 앞으로 활성화하고 새 프로세스를 종료합니다.
    """
    global MUTEX_HANDLE
    if os.name != 'nt':
        return True

    ERROR_ALREADY_EXISTS = 183
    kernel32 = ctypes.windll.kernel32
    user32 = ctypes.windll.user32

    MUTEX_HANDLE = kernel32.CreateMutexW(None, True, mutex_name)
    last_error = kernel32.GetLastError()

    if last_error == ERROR_ALREADY_EXISTS:
        # 이미 다른 인스턴스가 실행 중임
        print("[Info] 이미 실행 중인 My Asset 인스턴스가 존재합니다. 해당 창을 활성화합니다.")
        hwnd = user32.FindWindowW(None, "My Asset - 통합 자산관리")
        if hwnd:
            SW_RESTORE = 9
            user32.ShowWindow(hwnd, SW_RESTORE)
            user32.SetForegroundWindow(hwnd)
        return False
    return True


# --- Windows Job Object (OS 커널 레벨 자식 프로세스 연쇄 사살) ---
def create_kill_on_close_job():
    if os.name != 'nt':
        return None
    try:
        kernel32 = ctypes.windll.kernel32
        job_handle = kernel32.CreateJobObjectW(None, None)
        
        class JOBOBJECT_BASIC_LIMIT_INFORMATION(ctypes.Structure):
            _fields_ = [
                ('PerProcessUserTimeLimit', wintypes.LARGE_INTEGER),
                ('PerJobUserTimeLimit', wintypes.LARGE_INTEGER),
                ('LimitFlags', wintypes.DWORD),
                ('MinimumWorkingSetSize', ctypes.c_size_t),
                ('MaximumWorkingSetSize', ctypes.c_size_t),
                ('ActiveProcessLimit', wintypes.DWORD),
                ('Affinity', ctypes.c_size_t),
                ('PriorityClass', wintypes.DWORD),
                ('SchedulingClass', wintypes.DWORD),
            ]

        class IO_COUNTERS(ctypes.Structure):
            _fields_ = [
                ('ReadOperationCount', wintypes.ULARGE_INTEGER),
                ('WriteOperationCount', wintypes.ULARGE_INTEGER),
                ('OtherOperationCount', wintypes.ULARGE_INTEGER),
                ('ReadTransferCount', wintypes.ULARGE_INTEGER),
                ('WriteTransferCount', wintypes.ULARGE_INTEGER),
                ('OtherTransferCount', wintypes.ULARGE_INTEGER),
            ]

        class JOBOBJECT_EXTENDED_LIMIT_INFORMATION(ctypes.Structure):
            _fields_ = [
                ('BasicLimitInformation', JOBOBJECT_BASIC_LIMIT_INFORMATION),
                ('IoCounters', IO_COUNTERS),
                ('ProcessMemoryLimit', ctypes.c_size_t),
                ('JobMemoryLimit', ctypes.c_size_t),
                ('PeakProcessMemoryLimit', ctypes.c_size_t),
                ('PeakJobMemoryLimit', ctypes.c_size_t),
            ]

        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000
        JobObjectExtendedLimitInformation = 9

        info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION()
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE

        res = kernel32.SetInformationJobObject(
            job_handle,
            JobObjectExtendedLimitInformation,
            ctypes.byref(info),
            ctypes.sizeof(info)
        )
        if not res:
            return None
        return job_handle
    except Exception as e:
        print(f"[Warning] Job Object 설정 실패: {e}")
        return None

def assign_process_to_job(job_handle, process_handle):
    if job_handle and os.name == 'nt':
        ctypes.windll.kernel32.AssignProcessToJobObject(job_handle, int(process_handle))


# --- 포트 및 헬스체크 유틸리티 ---
def is_port_in_use(port=3000):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(('127.0.0.1', port)) == 0

def wait_for_server(url='http://localhost:3000', timeout=30):
    start = time.time()
    while time.time() - start < timeout:
        try:
            res = requests.get(url, timeout=1.0)
            if res.status_code < 500:
                return True
        except requests.exceptions.RequestException:
            pass
        time.sleep(0.3)
    return False


def get_base_dir():
    if getattr(sys, 'frozen', False):
        return os.path.dirname(os.path.abspath(sys.executable))
    return os.path.dirname(os.path.abspath(__file__))

def get_resource_path(relative_path):
    if hasattr(sys, '_MEIPASS'):
        bundle_path = os.path.join(sys._MEIPASS, relative_path)
        if os.path.exists(bundle_path):
            return bundle_path
    return os.path.join(get_base_dir(), relative_path)

# --- 메인 애플리케이션 클래스 ---
class MyAssetDesktopApp:
    def __init__(self, is_dev=False, port=3000, silent=False):
        self.is_dev = is_dev
        self.port = port
        self.silent = silent
        self.server_url = f"http://127.0.0.1:{port}"
        self.app_dir = get_base_dir()
        self.icon_path = get_resource_path("app_icon.ico")
        self.node_process = None
        self.job_handle = create_kill_on_close_job()
        self.window = None
        self.tray = None
        self.is_quitting = False

        # 사용자 데이터(쿠키, 로컬스토리지, 로그인 세션) 영속 보존용 디렉터리
        self.user_data_dir = os.path.join(
            os.environ.get('LOCALAPPDATA', os.environ.get('APPDATA', os.path.expanduser('~'))),
            'MyAsset',
            'webview_data'
        )
        os.makedirs(self.user_data_dir, exist_ok=True)

    def start_node_server(self):
        if is_port_in_use(self.port):
            print(f"[Info] 포트 {self.port}가 이미 사용 중입니다. 기존 서버를 재사용합니다.")
            return

        # 0.0.0.0 바인딩으로 127.0.0.1 및 localhost 모두 수신 허용
        cmd = ["npx.cmd", "next", "dev", "-H", "0.0.0.0", "-p", str(self.port)] if self.is_dev else ["npx.cmd", "next", "start", "-H", "0.0.0.0", "-p", str(self.port)]
        
        # 프로덕션 모드인데 .next 폴더가 없으면 자동 빌드 유도
        if not self.is_dev and not os.path.exists(os.path.join(self.app_dir, ".next")):
            print("[Info] 프로덕션 빌드(.next)가 없습니다. 최초 1회 빌드를 시작합니다...")
            subprocess.run(["npm.cmd", "run", "build"], cwd=self.app_dir, check=True)

        creationflags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
        self.node_process = subprocess.Popen(
            cmd,
            cwd=self.app_dir,
            creationflags=creationflags
        )
        
        # Windows Job Object에 자식 프로세스 핸들 등록
        if self.job_handle and self.node_process:
            assign_process_to_job(self.job_handle, self.node_process._handle)
            print("[Info] Node 프로세스가 Job Object에 성공적으로 편입되었습니다.")

        print(f"[Info] Next.js 서버 부팅 대기 중... ({self.server_url})")
        if not wait_for_server(self.server_url):
            raise RuntimeError("Next.js 서버가 제한 시간 내에 응답하지 않습니다.")
        print("[Info] Next.js 서버가 준비되었습니다.")

    def on_window_closing(self):
        if not self.is_quitting:
            self.window.hide()
            return False  # 파괴 방지, 트레이로 숨김
        return True

    def apply_window_icon(self):
        hwnd = ctypes.windll.user32.FindWindowW(None, "My Asset - 통합 자산관리")
        if hwnd:
            set_app_icon(hwnd, self.icon_path)

    def show_window(self):
        if self.window:
            self.window.show()
            self.window.restore()
            self.apply_window_icon()

    def renew_evaluation_async(self):
        def _task():
            try:
                headers = {}
                cron_secret = os.environ.get('CRON_SECRET')
                if cron_secret:
                    headers['Authorization'] = f"Bearer {cron_secret}"
                # Next.js /api/valuation 은 POST 메서드로 구현되어 있음
                res = requests.post(f"{self.server_url}/api/valuation", headers=headers, timeout=60.0)
                if res.status_code == 200:
                    if self.tray:
                        self.tray.notify("최신 시세 및 자산 평가가 성공적으로 갱신되었습니다.", "My Asset")
                else:
                    if self.tray:
                        self.tray.notify(f"평가 재계산 실패 (HTTP {res.status_code})", "My Asset")
            except Exception as e:
                if self.tray:
                    self.tray.notify(f"평가 재계산 오류: {str(e)}", "My Asset")
        threading.Thread(target=_task, daemon=True).start()

    def renew_base_eval_async(self):
        def _task():
            try:
                res = requests.post(f"{self.server_url}/api/renew-eval", timeout=30.0)
                if res.status_code == 200:
                    data = res.json()
                    msg = data.get('message', '기초평가손익이 성공적으로 갱신되었습니다.')
                    if self.tray:
                        self.tray.notify(msg, "My Asset")
                else:
                    if self.tray:
                        self.tray.notify(f"기초손익 갱신 실패 (HTTP {res.status_code})", "My Asset")
            except Exception as e:
                if self.tray:
                    self.tray.notify(f"기초손익 갱신 오류: {str(e)}", "My Asset")
        threading.Thread(target=_task, daemon=True).start()

    def open_external_browser(self):
        webbrowser.open(self.server_url)

    def logout(self):
        def _task():
            try:
                if self.window:
                    self.window.clear_cookies()
                    self.window.load_url(f"{self.server_url}/auth/login")
                    self.show_window()
                    if self.tray:
                        self.tray.notify("로그아웃되었습니다. 로그인 화면으로 이동합니다.", "My Asset")
            except Exception as e:
                print(f"[Warning] 로그아웃 처리 중 오류: {e}")
        threading.Thread(target=_task, daemon=True).start()

    def quit_application(self):
        self.is_quitting = True
        print("[Info] 애플리케이션 종료 시퀀스 가동...")
        
        # 1. Graceful Shutdown 엔드포인트 호출 (POST)
        try:
            requests.post(f"{self.server_url}/api/system/shutdown", timeout=1.0)
        except Exception:
            pass

        # 2. 서브프로세스 종료
        if self.node_process:
            try:
                self.node_process.terminate()
            except Exception:
                pass

        # 3. 트레이 및 윈도우 파괴
        if self.tray:
            try:
                self.tray.stop()
            except Exception:
                pass
        if self.window:
            try:
                self.window.destroy()
            except Exception:
                pass
        sys.exit(0)

    def setup_tray(self):
        try:
            icon_img = Image.open(self.icon_path) if os.path.exists(self.icon_path) else Image.new('RGB', (64, 64), color=(30, 64, 175))
        except Exception:
            icon_img = Image.new('RGB', (64, 64), color=(30, 64, 175))

        menu = pystray.Menu(
            pystray.MenuItem("대시보드 표시", lambda: self.show_window(), default=True),
            pystray.MenuItem("평가금액 즉시 재계산", lambda: self.renew_evaluation_async()),
            pystray.MenuItem("기초평가손익 갱신", lambda: self.renew_base_eval_async()),
            pystray.MenuItem("기본 브라우저로 열기", lambda: self.open_external_browser()),
            pystray.MenuItem("로그아웃 (세션 초기화)", lambda: self.logout()),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("완전 종료", lambda: self.quit_application())
        )
        self.tray = pystray.Icon("my_asset_js", icon_img, "My Asset - 통합 자산관리", menu)
        threading.Thread(target=self.tray.run, daemon=True).start()

    def run(self):
        self.start_node_server()
        self.setup_tray()

        self.window = webview.create_window(
            title="My Asset - 통합 자산관리",
            url=self.server_url,
            width=1320,
            height=880,
            min_size=(960, 640),
            hidden=self.silent,
            confirm_close=False
        )
        self.window.events.closing += self.on_window_closing
        self.window.events.shown += self.apply_window_icon
        
        # private_mode=False 및 전용 storage_path 지정으로 로그인 쿠키/세션 영속 보존
        webview.start(
            gui='edgechromium',
            debug=True,
            icon=self.icon_path,
            private_mode=False,
            storage_path=self.user_data_dir
        )


# --- 바로가기 및 시작프로그램 관리 유틸리티 ---
def get_pythonw_path(app_dir):
    venv_pythonw = os.path.join(app_dir, ".venv", "Scripts", "pythonw.exe")
    if os.path.exists(venv_pythonw):
        return venv_pythonw
    return os.path.join(os.path.dirname(sys.executable), "pythonw.exe")

def create_shortcut_link(target_path, link_path, arguments="", working_dir="", icon_path=""):
    ps_cmd = (
        f'$ws = New-Object -ComObject WScript.Shell; '
        f'$s = $ws.CreateShortcut("{link_path}"); '
        f'$s.TargetPath = "{target_path}"; '
        f'$s.Arguments = \'{arguments}\'; '
        f'$s.WorkingDirectory = "{working_dir}"; '
        f'if ("{icon_path}" -ne "" -and (Test-Path "{icon_path}")) {{ $s.IconLocation = "{icon_path}" }}; '
        f'$s.Save()'
    )
    subprocess.run(["powershell", "-NoProfile", "-Command", ps_cmd], check=True)

def get_launcher_target(current_dir):
    if getattr(sys, 'frozen', False):
        return sys.executable, True
    my_asset_exe = os.path.join(current_dir, "MyAsset.exe")
    if os.path.exists(my_asset_exe):
        return my_asset_exe, True
    return get_pythonw_path(current_dir), False

def manage_startup(register=True):
    startup_dir = os.path.join(os.environ.get('APPDATA', ''), r'Microsoft\Windows\Start Menu\Programs\Startup')
    shortcut_path = os.path.join(startup_dir, "MyAssetDesktop.lnk")
    if register:
        current_dir = get_base_dir()
        target_exe, is_native_exe = get_launcher_target(current_dir)
        script_path = os.path.join(current_dir, "desktop_tray_app.py")
        icon_path = target_exe if is_native_exe else os.path.join(current_dir, "app_icon.ico")
        arguments = "--silent" if is_native_exe else f'"{script_path}" --silent'
        create_shortcut_link(target_exe, shortcut_path, arguments, current_dir, icon_path)
        print(f"[Success] 시작프로그램 등록 완료 (무음 상주 모드): {shortcut_path}")
    else:
        if os.path.exists(shortcut_path):
            os.remove(shortcut_path)
            print(f"[Success] 시작프로그램 해제 완료: {shortcut_path}")
        else:
            print("[Info] 등록된 시작프로그램 바로가기가 없습니다.")

def manage_desktop_shortcut():
    desktop_dir = subprocess.check_output(
        ["powershell", "-NoProfile", "-Command", "[System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Desktop)"],
        text=True
    ).strip()
    current_dir = get_base_dir()
    target_exe, is_native_exe = get_launcher_target(current_dir)
    script_path = os.path.join(current_dir, "desktop_tray_app.py")
    icon_path = target_exe if is_native_exe else os.path.join(current_dir, "app_icon.ico")
    arguments = "" if is_native_exe else f'"{script_path}"'
    
    # 1. 바탕화면 바로가기 생성
    shortcut_path = os.path.join(desktop_dir, "MyAsset.lnk")
    create_shortcut_link(target_exe, shortcut_path, arguments, current_dir, icon_path)
    print(f"[Success] 바탕화면 바로가기 생성 완료: {shortcut_path}")

    # 2. 시작 메뉴(Start Menu Programs) 바로가기 등록 (작업표시줄 고정 시 아이콘 유지 필수 조건)
    programs_dir = os.path.join(os.environ.get('APPDATA', ''), r'Microsoft\Windows\Start Menu\Programs')
    start_menu_shortcut = os.path.join(programs_dir, "MyAsset.lnk")
    create_shortcut_link(target_exe, start_menu_shortcut, arguments, current_dir, icon_path)
    print(f"[Success] 시작 메뉴 바로가기 등록 완료: {start_menu_shortcut}")

    # 3. 작업표시줄 고정 폴더(User Pinned\TaskBar) 확인 및 Python.lnk 갱신
    taskbar_dir = os.path.join(os.environ.get('APPDATA', ''), r'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar')
    if os.path.exists(taskbar_dir):
        old_python_lnk = os.path.join(taskbar_dir, "Python.lnk")
        if os.path.exists(old_python_lnk):
            try:
                os.remove(old_python_lnk)
            except Exception:
                pass
        taskbar_shortcut = os.path.join(taskbar_dir, "MyAsset.lnk")
        create_shortcut_link(target_exe, taskbar_shortcut, arguments, current_dir, icon_path)
        print(f"[Success] 작업표시줄 고정 바로가기 갱신 완료: {taskbar_shortcut}")


if __name__ == "__main__":
    try:
        parser = argparse.ArgumentParser(description="My Asset 시스템 트레이 상주형 데스크톱 래퍼")
        parser.add_argument("--dev", action="store_true", help="Next.js 개발 모드로 구동")
        parser.add_argument("--port", type=int, default=3000, help="구동 포트 (기본값: 3000)")
        parser.add_argument("--silent", "--tray", dest="silent", action="store_true", help="초기 구동 시 창을 띄우지 않고 시스템 트레이에만 상주")
        parser.add_argument("--register-startup", action="store_true", help="Windows 부팅 시 자동 시작 등록")
        parser.add_argument("--unregister-startup", action="store_true", help="Windows 부팅 시 자동 시작 해제")
        parser.add_argument("--register-desktop", action="store_true", help="바탕화면에 MyAsset 바로가기 생성")
        args = parser.parse_args()

        # CLI 유틸리티 단독 실행 처리
        if args.register_startup:
            manage_startup(True)
            sys.exit(0)
        elif args.unregister_startup:
            manage_startup(False)
            sys.exit(0)
        elif args.register_desktop:
            manage_desktop_shortcut()
            sys.exit(0)

        # 단일 인스턴스 검사
        if not check_single_instance():
            sys.exit(0)

        app = MyAssetDesktopApp(is_dev=args.dev, port=args.port, silent=args.silent)
        app.run()
    except Exception as e:
        import traceback
        err_msg = traceback.format_exc()
        try:
            with open(os.path.join(get_base_dir(), "desktop_app_error.log"), "w", encoding="utf-8") as f:
                f.write(err_msg)
        except Exception:
            pass
        if os.name == 'nt':
            ctypes.windll.user32.MessageBoxW(0, f"애플리케이션 구동 중 오류가 발생했습니다:\n\n{err_msg}", "My Asset 오류", 0x10)
        sys.exit(1)
