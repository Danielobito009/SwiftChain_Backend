#!/bin/bash

echo "========================================="
echo "     Fleet API - Working Test           "
echo "========================================="

# 1. Delete old user
echo -e "\n1. Deleting old user..."
mongosh swiftchain --eval 'db.users.deleteOne({email: "fleet@example.com"})'

# 2. Register user
echo -e "\n2. Registering user..."
curl -s -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Fleet",
    "lastName": "Manager",
    "email": "fleet@example.com",
    "password": "SecurePass123!",
    "role": "enterprise"
  }' | jq '.'

# 3. MANUALLY UPDATE role to "enterprise"
echo -e "\n3. Manually updating role to 'enterprise'..."
mongosh swiftchain --eval 'db.users.updateOne({email: "fleet@example.com"}, {$set: {role: "enterprise"}})'

# 4. Verify role
echo -e "\n4. Verifying role..."
mongosh swiftchain --eval 'db.users.findOne({email: "fleet@example.com"}, {role: 1, email: 1})'

# 5. Login and get token
echo -e "\n5. Logging in..."
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"fleet@example.com","password":"SecurePass123!"}' \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

echo "Token: $TOKEN"

if [ -z "$TOKEN" ]; then
  echo "❌ Failed to get token!"
  exit 1
fi

# 6. Create fleet
echo -e "\n6. Creating fleet..."
FLEET_RESPONSE=$(curl -s -X POST http://localhost:3000/api/v1/fleets \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "SwiftChain Logistics Fleet",
    "treasuryAddress": "GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKL",
    "businessMetadata": {
      "companyName": "SwiftChain Inc",
      "industry": "Blockchain Logistics",
      "registrationNumber": "REG-2024-001",
      "vatNumber": "VAT-123456789",
      "address": {
        "street": "123 Blockchain Boulevard",
        "city": "San Francisco",
        "country": "USA",
        "postalCode": "94105"
      },
      "contactEmail": "fleet@swiftchain.com",
      "contactPhone": "+1-555-123-4567",
      "website": "https://swiftchain.com"
    }
  }')

echo "$FLEET_RESPONSE" | jq '.'

# Extract fleet ID
FLEET_ID=$(echo "$FLEET_RESPONSE" | grep -o '"_id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$FLEET_ID" ]; then
  echo "❌ Failed to get fleet ID!"
else
  echo "✅ Fleet ID: $FLEET_ID"
  
  # 7. Get fleet by ID
  echo -e "\n7. Getting fleet by ID..."
  curl -s -X GET "http://localhost:3000/api/v1/fleets/$FLEET_ID" \
    -H "Authorization: Bearer $TOKEN" | jq '.'
  
  # 8. Get all fleets
  echo -e "\n8. Getting all fleets..."
  curl -s -X GET "http://localhost:3000/api/v1/fleets?page=1&limit=10" \
    -H "Authorization: Bearer $TOKEN" | jq '.'
  
  # 9. Update fleet
  echo -e "\n9. Updating fleet..."
  curl -s -X PUT "http://localhost:3000/api/v1/fleets/$FLEET_ID" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{
      "name": "Updated Fleet Name - Mega Logistics",
      "businessMetadata": {
        "companyName": "Updated Company Inc",
        "industry": "Supply Chain Tech"
      }
    }' | jq '.'
  
  # 10. Get fleet metrics
  echo -e "\n10. Getting fleet metrics..."
  curl -s -X GET "http://localhost:3000/api/v1/fleets/$FLEET_ID/metrics" \
    -H "Authorization: Bearer $TOKEN" | jq '.'
  
  # 11. Delete fleet
  echo -e "\n11. Deleting fleet..."
  curl -s -X DELETE "http://localhost:3000/api/v1/fleets/$FLEET_ID" \
    -H "Authorization: Bearer $TOKEN" | jq '.'
fi

echo -e "\n========================================="
echo "    ✅ All tests completed!               "
echo "========================================="
