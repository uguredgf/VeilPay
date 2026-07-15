# VeilPay - Codex Handoff

Son guncelleme: 14 Temmuz 2026

## Amac

VeilPay, kurumsal maas odemelerinde tutar ve alici iliskisini gizlerken denetlenebilirlik saglamayi hedefleyen bir Midnight Network urun prototipidir. Night Sky Accelerator Cohort I basvurusu icin hazirlanmaktadir.

## Gercek mevcut durum

- Frontend: React, Vite ve TypeScript. Employer, employee ve compliance portallari backend API'lerini kullanir.
- Backend: Express, TypeScript ve SQLite. CSV, batch, claim, withdrawal lock, compliance listeleri ve audit kayitlari kalicidir.
- Wallet: Lace DApp connector ile gercek extension kesfi ve baglanti yapilir. Baglanti sayfa yenilemesinde sahte olarak geri yuklenmez.
- Execution: Varsayilan mod `simulation`. `sim_` kimlikleri zincir islemi degildir.
- Contracts: `contract/src/*.compact` dosyalari mimari taslaktir. Guncel Compact toolchain ile derlenmemis, deploy edilmemis ve audit edilmemistir.
- Production: Organizasyon kimlik dogrulamasi, rol yetkilendirmesi, gercek proof server/SDK bindings, custody modeli ve yasal inceleme yoktur.

## Calistirma

```bash
npm install
npm run dev
npm test
npm run build
```

Frontend: `http://localhost:5173`
Backend: `http://127.0.0.1:3001`

## Kritik kurallar

1. Simulation sonucunu testnet/mainnet islemi olarak sunma.
2. Compact taslaklarini derlenmis kontrat olarak sunma.
3. Gercek maas verisi veya gercek fon kullanma.
4. Basvuruda ekip, sirketlesme, traction, gelir ve finansal belgeler hakkinda sadece kurucu tarafindan dogrulanan bilgileri yaz.
5. Uretime gecmeden once wallet-signature auth, RBAC, secrets delivery, integer minor-unit accounting, external security review ve real Midnight deployment tamamlanmali.

## Sonraki kaynaklar

- `docs/NIGHT_SKY_PROGRAM_RESEARCH.md`
- `docs/NIGHT_SKY_APPLICATION.md`
- `docs/PROJECT_AUDIT.md`
- `docs/PITCH_DECK_OUTLINE.md`
