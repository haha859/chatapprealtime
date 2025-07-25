import requests, time

while True:
    try:
        r = requests.get("http://localhost:3000")
        print("✅ Ping OK:", r.status_code)
    except:
        print("❌ Không ping được.")
    time.sleep(30)
