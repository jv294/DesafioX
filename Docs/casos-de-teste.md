# Casos de Teste - Laboratório de Aplicativos Nativos

| ID | Técnica | Cenário | Resultado Esperado |
| :--- | :--- | :--- | :--- |
| **CT01** | Particionamento de Equivalência | Conceder permissão de câmera, capturar a foto e confirmar. | Imagem capturada e vinculada com sucesso ao registro do formulário. |
| **CT02** | Particionamento de Equivalência | Negar a permissão de acesso à câmera do dispositivo. 
| **CT03** | Transição de Estados | Acionar a câmera e optar pelo cancelamento da operação. | Retorno imediato ao formulário anterior sem salvar nenhuma nova imagem. |
| **CT04** | Transição de Estados | Capturar a foto, avaliar a prévia e optar por refazer. | A imagem rejeitada é removids e o sistema retorna ao modo de captura. |