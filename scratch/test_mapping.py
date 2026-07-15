import urllib.request
import json
import sys

def test_mapping(port):
    url = f"http://localhost:{port}/api/sync-supplier"
    headers = {
        "Content-Type": "application/json",
        "Authorization": "Bearer sheets_sync_2a7e93f8d5b14c639ab0e7d58f31b2d4"
    }
    
    # Mock Univer Workbook with user_id
    payload = {
        "type": "UPDATE",
        "table": "workbooks",
        "schema": "public",
        "record": {
            "id": "workbook-test-mapping",
            "name": "Test Mapping Sheet",
            "user_id": "abcde123-abcd-1234-abcd-1234567890ab",
            "data": {
                "id": "workbook-test-mapping",
                "sheets": {
                    "sheet-1": {
                        "id": "sheet-1",
                        "name": "Sheet 1",
                        "cellData": {
                            "0": {
                                "0": { "v": "Công ty" },
                                "1": { "v": "Email" }
                            },
                            "1": {
                                "0": { "v": "Nha May Test Mapping UI" },
                                "1": { "v": "mappingtest@factory.com" }
                            }
                        }
                    }
                }
            }
        }
    }
    
    data_bytes = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, method="POST", data=data_bytes, headers=headers)
    try:
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode('utf-8')
            print(f"Success: Status {response.status}, Body: {res_body}")
            return True
    except urllib.error.HTTPError as e:
        print(f"Error: Status {e.code}, Body: {e.read().decode('utf-8')}")
    except Exception as e:
        print(f"Error: {e}")
    return False

if __name__ == '__main__':
    port = 8000
    if len(sys.argv) > 1:
        port = int(sys.argv[1])
    test_mapping(port)
