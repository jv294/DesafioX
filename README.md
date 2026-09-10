# Desafio X

## Descrição

O Desafio X é uma rede social de desafios. O usuário cria uma conta, publica desafios com texto e mídia, responde no feed e marca outras pessoas.

O app funciona como PWA (híbrido). Dá para usar no navegador e também instalar pelo Chrome. Sem internet, os desafios ficam salvos no aparelho e são enviados quando a conexão volta.

### [Repositorio do GitHub](https://github.com/jv294/DesafioX)

## Integrantes

- João Vitor Afonso Damascena (202312489)
- Leandro Lima Cardoso (202323366)
- José Carlos Lago Carvalho Neto (202312488)
- Almir Coelho Rubim Junior (202312480)
- Laura Gomes da Fonseca (202312824)

## Como rodar

```
npm install
npm run dev
```

O front abre em `http://localhost:5173` e a API em `http://localhost:3001`.

## O que já funciona

- Login e cadastro (somente maiores de 18 anos)
- Feed de desafios, respostas e upload de foto/vídeo (até 5 MB)
- Indicador visual de Online / Offline
- Persistência no aparelho (`localStorage`): sessão, posts e fila
- Fila de sincronização: se estiver offline, o desafio é guardado e enviado ao reconectar
- Toasts avisando conexão, salvamento offline e sync
- QR Code para abrir/instalar o app
- PWA com cache para uso offline

## Matriz de Funcionalidades:

<table>
  <thead>
    <tr>
      <th>funcionalidade</th>
      <th>hibrido</th>
      <th>nativo</th>
      <th>tecnologia/recurso</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>login</td>
      <td>✔</td>
      <td>✔</td>
      <td>React + Vite</td>
    </tr>
    <tr>
      <td>cadastro (18+)</td>
      <td>✔</td>
      <td>✔</td>
      <td>React + Vite</td>
    </tr>
    <tr>
      <td>upload de midia</td>
      <td>✔</td>
      <td>✔</td>
      <td>React + Vite</td>
    </tr>
    <tr>
      <td>feed de desafios</td>
      <td>✔</td>
      <td>✔</td>
      <td>React + Vite</td>
    </tr>
    <tr>
      <td>offline / fila / sync</td>
      <td>✔</td>
      <td>✔</td>
      <td>localStorage + PWA</td>
    </tr>
  </tbody>
</table>

## Matriz de Migração:

<table>
  <thead>
    <tr>
      <th>funcionalidade</th>
      <th>Existe?</th>
      <th>Funciona?</th>
      <th>Será mantida?</th>
      <th>Precisa melhorar?</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>login</td>
      <td>Sim</td>
      <td>Sim</td>
      <td>Sim</td>
      <td>Não</td>
    </tr>
    <tr>
      <td>cadastro</td>
      <td>Sim</td>
      <td>Sim</td>
      <td>Sim</td>
      <td>Não</td>
    </tr>
    <tr>
      <td>upload de midia</td>
      <td>Sim</td>
      <td>Sim</td>
      <td>Sim</td>
      <td>Não</td>
    </tr>
    <tr>
      <td>feed de desafios</td>
      <td>Sim</td>
      <td>Sim</td>
      <td>Sim</td>
      <td>Não</td>
    </tr>
    <tr>
      <td>modo offline e sincronização</td>
      <td>Sim</td>
      <td>Sim</td>
      <td>Sim</td>
      <td>Não</td>
    </tr>
  </tbody>
</table>

## Proposta de evolução

1. Empacotar o PWA em APK para instalar direto no Android.
2. Melhorar o perfil do usuário.
3. Sistema de progresso e XP.

## Funcionalidades a serem desenvolvidas

* Gerar APK instalável
* Personalizar o perfil do usuário
* Sistema de Progresso e XP
