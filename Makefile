SHELL := /bin/bash

.PHONY: run
run:
	@set -euo pipefail; \
	echo "[make] starting Next.js dev server (npm run dev)"; \
	npm run dev & \
	DEV_PID=$$!; \
	echo "[make] warming up google-calendar-mcp (./scripts/run-google-calendar-mcp.sh --version)"; \
	./scripts/run-google-calendar-mcp.sh --version || true; \
	wait $$DEV_PID
