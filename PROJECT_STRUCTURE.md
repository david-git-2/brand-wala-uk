# Project Structure (Tree View)

## Current (As-Is)

```txt
/Users/david/Desktop/projects/brand-wala-uk
├── .firebaserc
├── FIRESTORE_SCHEMA.md
├── ORDER_STATUS.md
├── README.md
├── apphosting.emulator.yaml
├── firebase.json
├── firestore.indexes.json
├── firestore.rules
├── functions
│   ├── package.json
│   └── src
│       └── index.ts
├── package.json
├── python
│   ├── .venv
│   ├── Makefile
│   ├── credentials
│   │   ├── oauth_client.json
│   │   └── token.json
│   ├── data
│   │   └── pc_data.xlsx
│   ├── images
│   │   └── out_images
│   ├── readme.md
│   ├── requirements.txt
│   └── scripts
│       └── export_pc_data.py
└── web
    ├── package.json
    └── src
        ├── App.css
        ├── App.jsx
        ├── api
        ├── assets
        ├── auth
        ├── cart
        ├── components
        ├── firebase
        │   ├── cart.js
        │   ├── client.js
        │   ├── orders.js
        │   ├── productWeights.js
        │   ├── shipments.js
        │   └── users.js
        ├── index.css
        ├── lib
        ├── main.jsx
        ├── navigation
        ├── pages
        └── routes
```

## Target (Refactor-Friendly)

```txt
/Users/david/Desktop/projects/brand-wala-uk
├── .firebaserc
├── firebase.json
├── firestore.indexes.json
├── firestore.rules
├── python
│   ├── .venv
│   ├── Makefile
│   ├── credentials
│   │   ├── oauth_client.json
│   │   └── token.json
│   ├── data
│   │   └── pc_data.xlsx
│   ├── images
│   │   └── out_images
│   ├── readme.md
│   ├── requirements.txt
│   └── scripts
│       └── export_pc_data.py
├── docs
│   ├── FIRESTORE_SCHEMA.md
│   ├── ORDER_STATUS.md
│   └── PROJECT_STRUCTURE.md
├── functions
│   ├── package.json
│   └── src
│       ├── claims
│       ├── shared
│       ├── triggers
│       └── index.ts
└── web
    ├── package.json
    └── src
        ├── app
        │   ├── App.jsx
        │   ├── providers.jsx
        │   └── routes.jsx
        ├── assets
        ├── components
        │   ├── shared
        │   └── ui
        ├── config
        │   └── appConfig.js
        ├── domain
        │   ├── carts
        │   │   └── schema.json
        │   ├── investorTransactions
        │   │   └── schema.json
        │   ├── investors
        │   │   └── schema.json
        │   ├── orderItems
        │   │   └── schema.json
        │   ├── shipmentAccounting
        │   │   └── schema.json
        │   ├── shipmentItems
        │   │   └── schema.json
        │   ├── orders
        │   │   ├── calc.js
        │   │   ├── schema.json
        │   │   ├── types.js
        │   │   └── validators.js
        │   ├── shipments
        │   │   ├── calc.js
        │   │   ├── schema.json
        │   │   └── types.js
        │   ├── productWeights
        │   │   ├── schema.json
        │   │   └── types.js
        │   └── users
        │       ├── schema.json
        │       └── types.js
        ├── features
        │   ├── catalog
        │   │   ├── components
        │   │   ├── hooks
        │   │   ├── pages
        │   │   └── store
        │   │       └── catalogStore.js
        │   ├── orders
        │   │   ├── components
        │   │   ├── hooks
        │   │   ├── pages
        │   │   └── store
        │   │       └── ordersStore.js
        │   ├── shipments
        │   │   ├── components
        │   │   ├── hooks
        │   │   ├── pages
        │   │   └── store
        │   │       └── shipmentsStore.js
        │   ├── product-weights
        │   │   ├── components
        │   │   ├── hooks
        │   │   ├── pages
        │   │   └── store
        │   │       └── productWeightsStore.js
        │   └── users
        │       ├── components
        │       ├── hooks
        │       ├── pages
        │       └── store
        │           └── usersStore.js
        ├── infra
        │   └── firebase
        │       ├── client.js
        │       └── repos
        │           ├── cartRepo.js
        │           ├── orderRepo.js
        │           ├── productWeightRepo.js
        │           ├── shipmentRepo.js
        │           └── userRepo.js
        ├── lib
        │   ├── dates.js
        │   ├── format.js
        │   ├── ids.js
        │   └── money.js
        ├── services
        │   ├── orders
        │   │   └── orderService.js
        │   ├── shipments
        │   │   └── shipmentService.js
        │   ├── productWeights
        │   │   └── productWeightService.js
        │   └── users
        │       └── userService.js
        ├── store
        │   └── appStore.js
        └── styles
```

## Layer Rule (Short)

```txt
pages/components -> services -> domain + repos -> firebase
```

## Python Rule

```txt
python/* stays as-is (no structure refactor planned)
```
