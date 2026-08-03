#!/bin/sh
# hermes-minis launcher - safe for iSH (fully detached)
exec </dev/null
exec >/root/.hermes/logs/hermes-minis-gateway.log
exec 2>&1
cd /root/.hermes
exec /root/.hermes/.venv/bin/python -m hermes_cli.main gateway run --replace --external-supervisor
