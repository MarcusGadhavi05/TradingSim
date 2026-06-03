#!/bin/bash
echo "Fetching market data if missing..."
if [ ! -f "data/SPY.parquet" ]; then
  python scripts/fetch_data.py
fi
echo "Starting server..."
uvicorn backend.server:app --host 0.0.0.0 --port $PORT
