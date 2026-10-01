# Правила Firestore для доступа Риты

Правила лежат в Firebase Console → Firestore Database → Rules, в репозитории их нет.
Без этих правил Рита не увидит ничего (её gmail не проходит проверку `@hotelcompas.com`),
а скрытие вкладок в `index.html` - только интерфейс, не защита.

Ниже блок, который нужно **влить в текущие правила**, а не заменять ими всё.
Если пришлёшь текущий текст правил, я соберу готовую версию целиком.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn()  { return request.auth != null && request.auth.token.email_verified == true; }
    function mail()      { return request.auth.token.email.lower(); }
    function isTeam()    { return signedIn() && mail().matches('.*@hotelcompas[.]com'); }
    function isNastya()  { return signedIn() && mail() == 'a.belousova@hotelcompas.com'; }
    function isRita()    { return signedIn() && mail() == 'ritapatriciav@gmail.com'; }
    function isMember()  { return isTeam() || isRita(); }              // кто вообще может пользоваться доской

    // --- личные данные: каждый видит только свои; Настя дополнительно читает чужие (данные Риты), но не пишет ---
    function ownsDoc()   { return isMember() && resource.data.ownerId == request.auth.uid; }
    function ownsNew()   { return isMember() && request.resource.data.ownerId == request.auth.uid; }

    match /{coll}/{id} {
      allow read:   if coll in ['taskColumns','tasks','debts','goals','projectZones','projectCards',
                                'projectPriorities','knowledgeBase','researchReports','followupReminders']
                       && (ownsDoc() || isNastya());
      allow create: if coll in ['taskColumns','tasks','debts','goals','projectZones','projectCards',
                                'projectPriorities','knowledgeBase','researchReports','followupReminders']
                       && ownsNew();
      allow update, delete: if coll in ['taskColumns','tasks','debts','goals','projectZones','projectCards',
                                'projectPriorities','knowledgeBase','researchReports','followupReminders']
                       && ownsDoc();
    }

    // --- документы, ключ которых начинается с uid (tools/{uid}, weekZones/{uid}, ...) ---
    match /{coll}/{docId} {
      allow read:  if coll in ['tools','weekZones','dailyRoutine','medications','habits','weightLog','budgets','weekPlanner','healthLog']
                      && (isMember() && docId.matches('^' + request.auth.uid + '(_.*)?$') || isNastya());
      allow write: if coll in ['tools','weekZones','dailyRoutine','medications','habits','weightLog','budgets','weekPlanner','healthLog']
                      && isMember() && docId.matches('^' + request.auth.uid + '(_.*)?$');
    }

    // --- профиль пользователя: свой документ пишет сам; читать список могут только @hotelcompas.com ---
    match /users/{uid} {
      allow read:  if isTeam() || (isRita() && request.auth.uid == uid);
      allow write: if isMember() && request.auth.uid == uid;
    }

    // --- раздел Лидогенерация (бывший «Макс»): Настя, Макс, Рита ---
    match /{coll}/{id} {
      allow read, write: if coll in ['maxLeads','maxReminders','maxCalls','maxCompanies']
                            && (isNastya() || isRita() || mail() == 'm.oxentyuk@hotelcompas.com');
    }

    // Рита НЕ должна читать: leads, teamChat, calls, reports, weeklyReports, accessLinks, settings, users (чужие)
  }
}
```

Замечания:

- Правила `match /{coll}/{id}` с несколькими блоками могут конфликтовать с уже существующими (Firestore берёт **OR**
  всех подходящих `allow`), поэтому важно, чтобы в текущих правилах не было общего
  `allow read, write: if request.auth != null` - иначе Рита всё равно получит доступ ко всему.
- Рита должна сначала зарегистрироваться на доске (почта + подтверждение письма), иначе кнопка «Данные Риты» у Насти
  покажет «Рита ещё не зарегистрировалась».
