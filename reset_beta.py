"""内测出厂重置（执行版）：备份 -> 清空业务表（保留 founder/大使/校方 + 学校）-> FTS 重建 -> 清上传图片。
用法：python reset_beta.py          （会先自动备份数据库到 backups/reset_beta_<时间戳>/）"""
import sqlite3, shutil, os, sys, time
ROOT = r'E:/mimo code 树洞设计'
DB = os.path.join(ROOT, 'backend', 'cervus.db')
ts = time.strftime('%Y%m%d_%H%M%S')
bdir = os.path.join(ROOT, 'backups', f'reset_beta_{ts}')
os.makedirs(bdir, exist_ok=True)
shutil.copy2(DB, os.path.join(bdir, 'cervus.db'))
up = os.path.join(ROOT, 'backend', 'static', 'uploads')
if os.path.isdir(up):
    shutil.copytree(up, os.path.join(bdir, 'uploads'), dirs_exist_ok=True)
print('备份 ->', bdir)

con = sqlite3.connect(DB)
KEEP = "role IN ('founder','ambassador') OR (role='school_official' AND username LIKE '%official')"
tables = ['post_vectors', 'burn_audit_logs', 'audit_logs', 'message_reads', 'chat_group_members',
          'chat_groups', 'votes', 'polls', 'tarot_history', 'direct_messages', 'conversations',
          'follows', 'notifications', 'user_likes', 'user_stars', 'reports', 'messages',
          'comments', 'posts']
for t in tables:
    n = con.execute(f"DELETE FROM {t}").rowcount
    print(f'  清空 {t}: {n} 行')
n = con.execute(f"DELETE FROM users WHERE NOT ({KEEP})").rowcount
print(f'  删除非官方用户: {n} 个')
con.commit()
print('保留:', con.execute("SELECT role, COUNT(*) FROM users GROUP BY role").fetchall())
con.execute("INSERT INTO posts_fts(posts_fts) VALUES('rebuild')")
con.execute("INSERT INTO comments_fts(comments_fts) VALUES('rebuild')")
con.commit()
con.close()
if os.path.isdir(up):
    cleared = 0
    for f in os.listdir(up):
        try: os.remove(os.path.join(up, f)); cleared += 1
        except OSError: pass
    print('  清空上传图片:', cleared, '个')
print('DONE — 出厂态就绪')
