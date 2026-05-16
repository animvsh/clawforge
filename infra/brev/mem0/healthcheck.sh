#!/bin/bash

echo "Checking Mem0 health..."

# Curl the health endpoint with timeout
response=$(curl -s -f -m 10 http://localhost:8000/health 2>/dev/null)

if [ $? -eq 0 ]; then
    echo "Mem0 is healthy: $response"
    exit 0
else
    echo "Mem0 health check failed"
    exit 1
fi