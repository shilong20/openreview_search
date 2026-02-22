.PHONY: dev backend frontend

dev:
	./start_all.sh

backend:
	bash start_backend.sh

frontend:
	cd frontend && npm run dev
