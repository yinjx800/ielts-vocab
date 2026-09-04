import os, sys, time, socket, subprocess, webbrowser

PORT = 8765
BASE_URL = f"http://127.0.0.1:{PORT}"

def is_port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(('127.0.0.1', port)) == 0

def cleanup_port(port: int):
    """查找并彻底释放指定端口上的所有旧进程"""
    try:
        cmd = f'netstat -ano | findstr ":{port}" | findstr "LISTENING"'
        res = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        current_pid = str(os.getpid())
        pids = set()
        for line in res.stdout.strip().splitlines():
            parts = line.strip().split()
            if len(parts) >= 5:
                pid = parts[-1]
                if pid.isdigit() and pid != "0" and pid != current_pid:
                    pids.add(pid)
        for pid in pids:
            try:
                subprocess.run(f"taskkill /f /pid {pid}", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except Exception:
                pass
    except Exception:
        pass

    # 等待端口彻底释放 (最大等待 3 秒)
    for _ in range(15):
        if not is_port_in_use(port):
            break
        time.sleep(0.2)

def launch_browser():
    # 轮询探测端口，确认 uvicorn 服务已成功监听就绪
    for _ in range(40):
        time.sleep(0.2)
        if is_port_in_use(PORT):
            break
    time.sleep(0.3)

    target_url = f"{BASE_URL}/?fresh={int(time.time())}"
    edge_paths = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    ]
    for path in edge_paths:
        if os.path.exists(path):
            try:
                # 显式使用 --new-window，避开旧窗口可能存在的缓存/死锁页面
                subprocess.Popen([path, "--new-window", target_url])
                return
            except Exception:
                pass
    webbrowser.open(target_url)

if __name__ == "__main__":
    print("=" * 62)
    print("      《雅思词汇真经》智能五维记忆系统 · 服务启动控制台")
    print(f"      本地访问地址: {BASE_URL}")
    print("=" * 62)
    print("\n[1/3] 正在检查并释放端口 8765...")
    cleanup_port(PORT)

    import threading
    import uvicorn

    print("[2/3] 正在启动本地高速服务器并调起浏览器...")
    threading.Thread(target=launch_browser, daemon=True).start()

    print("[3/3] 服务已就绪！\n【提示】使用期间请保持本黑框控制台开启；关闭此黑框即可退出系统。\n")
    try:
        uvicorn.run("app:app", host="127.0.0.1", port=PORT, reload=False, log_level="warning")
    except KeyboardInterrupt:
        print("\n[提示] 服务已安全退出。")
    except Exception as e:
        print(f"\n[错误] 服务异常退出: {e}")
        input("\n按回车键退出...")
