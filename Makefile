SHELL := /bin/bash
ENV_FILE ?= .env
ENV_SAMPLE ?= .env.sample

.PHONY: bootstrap ensure-env install dev lint test typecheck check clean

bootstrap: ensure-env install

ensure-env:
	@if [ ! -f $(ENV_FILE) ]; then \
		if [ ! -f $(ENV_SAMPLE) ]; then \
			echo "Sample env file $(ENV_SAMPLE) is missing" && exit 1; \
		fi; \
		cp $(ENV_SAMPLE) $(ENV_FILE); \
		echo "Created $(ENV_FILE) from $(ENV_SAMPLE). OPENAI_API_KEY を編集してください。"; \
	else \
		echo "$(ENV_FILE) は既に存在します。"; \
	fi

install:
	@if [ ! -d node_modules ]; then \
		npm install; \
	else \
		echo "node_modules が存在するため npm install をスキップします。"; \
	fi

dev: bootstrap
	npm run dev

lint:
	npm run lint

test:
	npm run test

typecheck:
	npx tsc --noEmit

check: lint test typecheck

clean:
	rm -rf node_modules .next
