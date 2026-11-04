# Firebase Rules sugeridas (Firestore + Storage)

> **Importante:** este arquivo é apenas documentação de referência. As regras abaixo **não** são aplicadas automaticamente.

## Firestore (`documentos`)

Objetivo: coleção global `documentos` com leitura/criação para usuários autenticados e edição/exclusão apenas do dono.

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /documentos/{docId} {
      allow read: if request.auth != null;

      allow create: if request.auth != null
        && request.resource.data.userUid == request.auth.uid
        && request.resource.data.obraId is string
        && request.resource.data.obraId.size() > 0
        && request.resource.data.tipo is string
        && request.resource.data.tipo.size() > 0;

      allow update, delete: if request.auth != null
        && request.auth.uid == resource.data.userUid;
    }
  }
}
```

## Storage (`documentos/{obraId}/{uid}/{file}`)

Objetivo: escrita apenas pelo dono do UID no path e leitura autenticada (ou opcionalmente só dono).

```txt
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /documentos/{obraId}/{uid}/{fileName} {
      allow write: if request.auth != null && request.auth.uid == uid;
      allow read: if request.auth != null;

      // Alternativa mais restritiva para leitura:
      // allow read: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```