# Bitcoin POS justfile

# Install npm dependencies
install:
    npm install

# Start development server
serve: install
    npm start

# Build for production
build: install
    npm run build

# Lint TypeScript files
lint:
    npm run lint

# Fix linting issues
lint-fix:
    npm run lint:fix

