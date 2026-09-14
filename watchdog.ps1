# 鹿鸣回音后端看门狗（2026-09-13）
# 每 30s 探 /health；连续 3 次失败（约 90s）→ 杀掉全部 uvicorn 并重启一个。
# 由 Hermes 终端 background=true 拉起，长期驻留。日志追加到 watchdog.log。

$ErrorActionPreference = "SilentlyContinue"
$root = "E:\mimo code 树洞设计\backend"
$py = "C:\Users\FXK\AppData\Local\hermes\hermes-agent\venv\Scripts\python.exe"
$log = "E:\mimo code 树洞设计\watchdog.log"
$fail = 0

function Log($msg) {
    $line = ("[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg)
    Add-Content -Path $log -Value $line -Encoding UTF8
}

Log "watchdog 启动（间隔 30s，连续 3 次失败重启）"

while ($true) {
    Start-Sleep -Seconds 30
    try {
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:8000/health" -TimeoutSec 6 -UseBasicParsing
        if ($resp.StatusCode -eq 200) {
            if ($fail -gt 0) { Log ("恢复健康 (此前连续失败 {0} 次)" -f $fail) }
            $fail = 0
            continue
        }
    } catch { }

    $fail++
    Log ("health 探活失败，连续第 {0} 次" -f $fail)

    if ($fail -ge 3) {
        Log "连续 3 次失败 → 重启后端"
        # 杀掉全部 uvicorn（按命令行匹配，防端口 splat）
        Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match "uvicorn" } |
            ForEach-Object {
                Log ("  kill PID " + $_.ProcessId)
                Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
            }
        Start-Sleep -Seconds 4
        # 起一个新后端（独立进程，脱离本脚本生命周期）
        Start-Process -FilePath $py `
            -ArgumentList "-m","uvicorn","app.main:app","--host","127.0.0.1","--port","8000" `
            -WorkingDirectory $root `
            -WindowStyle Hidden `
            -RedirectStandardOutput "E:\mimo code 树洞设计\backend\uvicorn_out.log" `
            -RedirectStandardError "E:\mimo code 树洞设计\backend\uvicorn_err.log"
        Log "后端已重启，等待就绪..."
        Start-Sleep -Seconds 12
        $ok = $false
        try {
            $r2 = Invoke-WebRequest -Uri "http://127.0.0.1:8000/health" -TimeoutSec 6 -UseBasicParsing
            $ok = ($r2.StatusCode -eq 200)
        } catch { }
        if ($ok) { Log "重启成功，health 200" ; $fail = 0 }
        else { Log "重启后仍不健康，下一轮继续尝试" ; $fail = 2 }
    }
}
