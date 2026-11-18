#!/bin/sh
# Marca uma versão nova do site: atualiza o ?v= dos arquivos e o version.json.
# Assim quem está com o site aberto recebe o aviso "Nova atualização disponível".
V=$(date +%Y%m%d%H%M)
sed -i -E "s#\?v=[0-9]+#?v=$V#g" index.html
printf '{ "versao": "%s" }\n' "$V" > version.json
echo "Versão $V"
