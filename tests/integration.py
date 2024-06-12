import requests

BASE_URL = "http://localhost:3004"


def test_health():
    response = requests.get(f"{BASE_URL}/availabilities/health")
    assert response.status_code == 200
    assert response.json() == {"message": "Hello, World!"}
