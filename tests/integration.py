import requests
import json
import random

BASE_URL = "http://localhost:3004"

headers = {
  'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6InNhbmRyYTEiLCJpYXQiOjE3MTgzMDU4ODEsImV4cCI6MTcxODMyMzg4MX0.pt5_cIifa3UQNJfQLKYVKHvQyT0yOD3yqEHs1-W0UtM'
}

def test_health():
    response = requests.get(BASE_URL + "/availabilities/health")
    assert response.status_code == 200
    assert response.json() == {"message": "Hello, World!"}
    print("Health check passed.")

def test_search_availability():
    url = BASE_URL + "/availabilities?endDate=05-07-2024&location=Beograd&guests=6"
    headers = {
        'Content-Type': 'application/json'
    }
    
    response = requests.get(url, headers=headers)
    print(response.json)
    assert response.status_code == 200
    availabilities = response.json()
    assert isinstance(availabilities, list)
    print("Search availability passed.")
    print("Availabilities:", json.dumps(availabilities, indent=2))

def test_reservations_empty():
    url = BASE_URL + "/reservations"

    response = requests.get(url, headers=headers)
    print(response.json)
    assert response.status_code == 200
    assert response.json() == []
    print("Reservations list is initially empty.")

def test_create_reservation():
    url = BASE_URL + "/reservations/12345" 

    payload = json.dumps({
        "startDate": "01-07-2024",
        "endDate": "05-07-2024",
        "price": 200,
        "guests": 2
    })

    response = requests.post(url, headers=headers, data=payload)
    print(response.json())
    assert response.status_code == 200
    reservation = response.json()
    assert reservation["accommodationId"] == "12345"
    assert reservation["username"] == "testuser"
    assert reservation["price"] == 200
    assert reservation["guests"] == 2
    print("Reservation created successfully.")

def test_reservations_not_empty():
    url = BASE_URL + "/reservations"

    response = requests.get(url, headers=headers)
    assert response.status_code == 200
    reservations = response.json()
    assert len(reservations) > 0
    print("Reservations list contains the newly created reservation.")

test_health()
test_search_availability()
test_reservations_empty()
test_create_reservation()
test_reservations_not_empty()
