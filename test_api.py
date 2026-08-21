import requests
import json

BASE_URL = "http://localhost:8000"

def test_api():
    print("测试鹿鸣回音社区 API...")
    
    # 测试根路径
    response = requests.get(f"{BASE_URL}/")
    print(f"根路径: {response.json()}")
    
    # 测试健康检查
    response = requests.get(f"{BASE_URL}/health")
    print(f"健康检查: {response.json()}")
    
    # 测试创建用户
    user_data = {
        "username": "test_user",
        "nickname": "测试用户"
    }
    response = requests.post(f"{BASE_URL}/api/users/", json=user_data)
    print(f"创建用户: {response.json()}")
    
    # 测试模拟登录
    response = requests.post(f"{BASE_URL}/api/users/login?username=new_user")
    print(f"模拟登录: {response.json()}")
    
    # 测试创建帖子
    post_data = {
        "title": "测试帖子",
        "content": "这是一个测试帖子的内容",
        "user_id": 1
    }
    response = requests.post(f"{BASE_URL}/api/posts/", json=post_data)
    print(f"创建帖子: {response.json()}")
    
    # 测试获取帖子列表
    response = requests.get(f"{BASE_URL}/api/posts/")
    print(f"获取帖子列表: {response.json()}")
    
    print("\n所有测试完成！")

if __name__ == "__main__":
    test_api()
