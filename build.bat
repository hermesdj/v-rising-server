cd ../v-rising-client
call npm run build
xcopy /s/e /y .\dist ..\v-rising-server\public
cd ../v-rising-server
npm run dev
