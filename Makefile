.PHONY: help install reinstall clean lint format build test deploy package

PLUGIN_NAME := screenshotocr
DIST_DIR := dist
PACKAGE_FILE := wox.plugin.$(PLUGIN_NAME).wox
PACKAGE_ZIP := wox.plugin.$(PLUGIN_NAME).zip
POWERSHELL := powershell -NoProfile -ExecutionPolicy Bypass -Command

help:
	@echo "Available commands:"
	@echo "  make install    - Install project dependencies"
	@echo "  make reinstall  - Reinstall project dependencies from scratch"
	@echo "  make clean      - Clean build output"
	@echo "  make lint       - Run linter"
	@echo "  make format     - Format code and metadata"
	@echo "  make test       - Run tests"
	@echo "  make build      - Build plugin into dist/"
	@echo "  make deploy     - Deploy dist/ to local Wox plugin directory"
	@echo "  make package    - Build and package plugin as $(PACKAGE_FILE)"

install:
	pnpm install

reinstall:
ifeq ($(OS),Windows_NT)
	$(POWERSHELL) "foreach ($$path in @('$(DIST_DIR)', 'node_modules')) { if (Test-Path $$path) { Remove-Item -Recurse -Force $$path } }"
else
	rm -rf $(DIST_DIR) ./node_modules
endif
	pnpm install

clean:
ifeq ($(OS),Windows_NT)
	$(POWERSHELL) "foreach ($$path in @('$(DIST_DIR)', 'tools/WindowsOcr/publish', '$(PACKAGE_FILE)', '$(PACKAGE_ZIP)')) { if (Test-Path $$path) { Remove-Item -Recurse -Force $$path } }"
else
	rm -rf $(DIST_DIR) ./tools/WindowsOcr/publish $(PACKAGE_FILE) $(PACKAGE_ZIP)
endif

lint:
	pnpm run lint

format:
	pnpm run format

test:
	pnpm test

build:
	pnpm build

deploy: build
	pnpm run deploy

package: build
ifeq ($(OS),Windows_NT)
	$(POWERSHELL) "foreach ($$path in @('$(PACKAGE_FILE)', '$(PACKAGE_ZIP)')) { if (Test-Path $$path) { Remove-Item -Force $$path } }; Compress-Archive -Path '$(DIST_DIR)\*' -DestinationPath '$(PACKAGE_ZIP)'; Move-Item '$(PACKAGE_ZIP)' '$(PACKAGE_FILE)'"
else
	cd $(DIST_DIR) && zip -r ../$(PACKAGE_FILE) .
endif
