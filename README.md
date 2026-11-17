# Desafio X

## Descrição

O Desafio X é uma rede social de desafios. O usuário cria uma conta, adiciona amigos, publica desafios com texto e mídia e responde no feed.

O app funciona como PWA (híbrido). Dá para usar no navegador e também instalar pelo Chrome. Sem internet, os desafios ficam salvos no aparelho e são enviados quando a conexão volta.

### [Link funcional do app](https://desafio-x-jfqd.vercel.app/)

### [Baixar APK do app](https://github.com/jv294/DesafioX/tree/main/build/app-debug.apk)

### [Repositorio do GitHub](https://github.com/jv294/DesafioX)

## Integrantes

- João Vitor Afonso Damascena (202312489)
- Leandro Lima Cardoso (202323366)
- José Carlos Lago Carvalho Neto (202312488)
- Almir Coelho Rubim Junior (202312480)
- Laura Gomes da Fonseca (202312824)

## Como rodar

```cmd
npm install
npm run dev
```

## Como rodar os testes

```cmd
npm test
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
- Amigos: adicionar por ID, link de convite ou QR Code
- Solicitações de amizade (aceitar ou recusar)
- Alcance do desafio: só amigos, desafio direto ou arena pública
- Perfil com foto e edição de nome

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
    <tr>
      <td>amigos / convite / QR</td>
      <td>✔</td>
      <td>✔</td>
      <td>React + API</td>
    </tr>
    <tr>
      <td>desafio só para amigos</td>
      <td>✔</td>
      <td>✔</td>
      <td>React + API</td>
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
    <tr>
      <td>amigos</td>
      <td>Sim</td>
      <td>Sim</td>
      <td>Sim</td>
      <td>Não</td>
    </tr>
  </tbody>
</table>

## Proposta de evolução

1. Parties / grupos.
2. Sistema de progresso e XP.
3. Dividir codigo da aplicação em modulos.

## Funcionalidades a serem desenvolvidas

* Parties / grupos
* Sistema de Progresso e XP
