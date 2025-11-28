{
  description = "Bitcoin POS development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
        };
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            # Node.js and package managers
            nodejs_20
            
            # Additional utilities
            jq    # for JSON manipulation
            typescript
            just
          ];

          shellHook = ''
            echo "₿ Bitcoin POS Development Environment"
            echo "Node.js version: $(node --version)"
            echo "npm version: $(npm --version)"
            
            # Ensure npm packages can find native dependencies
            export PKG_CONFIG_PATH="${pkgs.pkg-config}/lib/pkgconfig"
            
            echo ""
            echo "Available commands:"
            echo "  npm install  - Install dependencies"
            echo "  npm start    - Start development server"
            echo "  just serve   - Start development server"
            echo ""
          '';
        };
      });
}

