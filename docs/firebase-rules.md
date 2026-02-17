# Firebase / Firestore rules (clientes)

Use este exemplo como ponto de partida para proteger o acesso de clientes ao próprio documento.

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /clientes/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```