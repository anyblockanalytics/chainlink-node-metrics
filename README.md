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

Endpoints
---------
### `/`
Basic application information `{"name":"chainlink-node-metrics","version":"0.1.0"}`

### `/ping`
Application health endpoint. Just returns HTTP Status 200

### `/influxdb`
Metrics in InfluxDB line protocol syntax. See https://docs.influxdata.com/influxdb/v1.7/write_protocols/line_protocol_tutorial/#syntax
`chainlink-node,technology=ethereum,blockchain=ethereum,network=kovan,host=localhost,account=0x0000000000000000000000000000000000000000,oracle=0x0000000000000000000000000000000000000000 eth=42.4815162342,link=23.42,gasPrice=1.8,specs=9i,runs=7589i 1576700441997000000`

Telegraf
--------
A basic telegraf configuration could look like this
```
[[inputs.http]]
  urls = [
    "http://localhost:8080/influxdb/"
  ]
```

Possible Improvements
---------------------
- Prometheus Support
- Nagios Support
