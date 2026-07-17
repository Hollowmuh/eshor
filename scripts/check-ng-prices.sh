#!/usr/bin/env bash
set -euo pipefail
BASE=http://localhost:9000
PK=pk_ab5ed2caf47a15d4e41a55f7735fad36f9a69b33cb9eefb3e77f7b7a322f7d0e

REGION_ID=$(curl -fsS "$BASE/store/regions" -H "x-publishable-api-key: $PK" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);const r=j.regions.find(x=>x.name==='Nigeria');console.log(r?r.id:'NOT_FOUND')})")

echo "Nigeria region id: $REGION_ID"
if [ "$REGION_ID" = "NOT_FOUND" ]; then exit 1; fi

curl -fsS "$BASE/store/products?region_id=$REGION_ID&handle=aja-dress&fields=title,handle,*variants.calculated_price" \
  -H "x-publishable-api-key: $PK" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
      const j=JSON.parse(d);
      const p=j.products[0];
      if(!p){console.log('PRODUCT NOT FOUND');process.exit(1);}
      console.log('title:',p.title);
      for (const v of p.variants) {
        console.log(' ', v.title, '->', v.calculated_price ? v.calculated_price.calculated_amount+' '+v.calculated_price.currency_code : 'NO PRICE');
      }
    })"
