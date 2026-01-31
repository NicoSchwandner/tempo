.PHONY: serve open dev clean help

PORT ?= 8000

serve: ## Start development server on port 8000
	@echo "Starting server at http://localhost:$(PORT)"
	@python3 -m http.server $(PORT)

open: ## Open browser to localhost:8000
	@open http://localhost:$(PORT)

dev: ## Start server and open browser
	@echo "Starting server at http://localhost:$(PORT)"
	@open http://localhost:$(PORT) &
	@python3 -m http.server $(PORT)

clean: ## Remove generated files
	@echo "Nothing to clean"

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'
