@echo off
echo ========================================
echo 校园树洞社区 - 启动脚本
echo ========================================
echo.

echo 正在启动后端服务...
cd /d "E:\mimo code 树洞设计\backend"
start cmd /k ".venv\Scripts\python.exe init_db.py && .venv\Scripts\uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

echo 等待后端服务启动...
timeout /t 3 /nobreak > nul

echo 正在启动前端服务...
cd /d "E:\mimo code 树洞设计\frontend"
start cmd /k "npm run dev"

echo.
echo ========================================
echo 服务启动完成！
echo ========================================
echo.
echo 后端服务: http://localhost:8000
echo 前端服务: http://localhost:5173
echo API文档: http://localhost:8000/docs
echo.
echo 按任意键退出...
pause > nul
