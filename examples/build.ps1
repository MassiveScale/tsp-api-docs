Remove-Item -Path ./versioned-api/tsp-output -Recurse -Force
tsp compile ./versioned-api/. --config ./versioned-api/azure-devops.tspconfig.yaml
tsp compile ./versioned-api/. --config ./versioned-api/github.tspconfig.yaml
tsp compile ./versioned-api/. --config ./versioned-api/docfx.tspconfig.yaml