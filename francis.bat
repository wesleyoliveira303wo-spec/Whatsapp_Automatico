@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

rem ============================================================
rem  Francis — operacao local (Windows)
rem
rem  Um unico arquivo com subcomandos, em vez de cinco scripts
rem  separados: menos arquivos na raiz do repositorio e um lugar
rem  so para ajustar se o comando do Compose mudar.
rem
rem  Uso:  francis start | stop | restart | status | logs | rebuild | migrate
rem ============================================================

set "COMPOSE=docker compose -f docker-compose.prod.yml"
set "CMD=%~1"
if "%CMD%"=="" set "CMD=help"

rem --- Docker Desktop precisa estar rodando para qualquer subcomando ---
docker info >nul 2>&1
if errorlevel 1 (
  echo.
  echo  [ERRO] O Docker Desktop nao esta em execucao.
  echo         Abra o Docker Desktop, espere o icone ficar verde e tente de novo.
  echo.
  exit /b 1
)

if /i "%CMD%"=="start" (
  echo Subindo o Francis...
  %COMPOSE% up -d
  echo.
  echo Dashboard: http://localhost:3000
  echo API:       http://localhost:4000/health
)

if /i "%CMD%"=="stop" (
  echo Parando o Francis...
  rem "stop" e nao "down": preserva os containers e nao mexe em volume nenhum.
  %COMPOSE% stop
)

if /i "%CMD%"=="restart" (
  echo Reiniciando o Francis...
  %COMPOSE% restart
)

if /i "%CMD%"=="status" (
  %COMPOSE% ps
)

if /i "%CMD%"=="logs" (
  rem Segundo argumento opcional: nome do servico (api, worker, dashboard...).
  if "%~2"=="" (
    %COMPOSE% logs -f --tail=100
  ) else (
    %COMPOSE% logs -f --tail=100 %~2
  )
)

if /i "%CMD%"=="rebuild" (
  echo Reconstruindo as imagens e subindo...
  %COMPOSE% up -d --build
)

if /i "%CMD%"=="migrate" (
  rem Normalmente desnecessario: o servico "migrate" do compose ja roda
  rem sozinho a cada "start". Fica aqui para aplicar uma migration nova
  rem sem reiniciar a API e o worker.
  %COMPOSE% run --rm migrate
)

if /i "%CMD%"=="help" (
  echo.
  echo   Francis — operacao local
  echo.
  echo   francis start      Sobe todos os servicos
  echo   francis stop       Para tudo ^(dados preservados^)
  echo   francis restart    Reinicia todos os servicos
  echo   francis status     Mostra o estado dos containers
  echo   francis logs       Acompanha os logs ^(Ctrl+C para sair^)
  echo   francis logs api   Logs de um servico especifico
  echo   francis rebuild    Reconstroi as imagens apos mudanca de codigo
  echo   francis migrate    Aplica migrations do Prisma manualmente
  echo.
  echo   Dashboard: http://localhost:3000
  echo.
)

endlocal
