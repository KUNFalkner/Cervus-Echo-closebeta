"""WeChat OAuth client. Dev mode: fake openid from code prefix. Prod: real WeChat API."""
import os
from dataclasses import dataclass

import httpx

WECHAT_APP_ID = os.getenv("WECHAT_APP_ID", "wx_dev_stub")
WECHAT_APP_SECRET = os.getenv("WECHAT_APP_SECRET", "dev_secret_stub")


@dataclass
class WechatUser:
    openid: str
    unionid: str = ""


async def code_to_openid(code: str) -> WechatUser:
    """Exchange WeChat OAuth code for openid. Falls back to dev stub."""
    # ponytail: dev stub when no real AppID configured
    if WECHAT_APP_ID == "wx_dev_stub":
        return WechatUser(openid=f"wx_dev_{code[:16] if len(code) > 16 else code}")

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://api.weixin.qq.com/sns/oauth2/access_token",
            params={
                "appid": WECHAT_APP_ID,
                "secret": WECHAT_APP_SECRET,
                "code": code,
                "grant_type": "authorization_code",
            },
        )
        data = resp.json()
        if "errcode" in data and data["errcode"] != 0:
            raise ValueError(f"WeChat error: {data.get('errmsg', 'unknown')}")
        return WechatUser(openid=data["openid"], unionid=data.get("unionid", ""))
