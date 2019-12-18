Chainlink Node Metrics
=======================
Lightweight server that fetches metrics from a Chainlink node and returns the result in InfluxDB line protocol syntax.
Simplifies monitoring in a dockerized environment.

Configuration
-------------
See `.env.example` for all available configuration options.

Development
-----------
`npm run dev`

Docker
------
```
docker run --rm -p 8080:8080 -e "CHAINLINK_HOST=http://localhost:6688" -e "CHAINLINK_EMAIL=YOUR_API_EMAIL" -e "CHAINLINK_PASSWORD=YOUR_API_PASSWORD" anyblockanalytics/chainlink-node-metrics:latest
```

Possible Improvements
---------------------
- Prometheus Support
- Nagios Support
