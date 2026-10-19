# Contribuindo com o Panorama da Educação

Contribuições de todos os tamanhos são bem-vindas. Você pode colaborar com:

- Novos indicadores educacionais e fontes públicas oficiais.
- Melhorias nos mapas, gráficos e demais visualizações.
- Correções de bugs, acessibilidade e responsividade.
- Evolução do processamento Python.
- Testes e documentação.

## Ambiente de desenvolvimento

Use Python 3.11 ou superior para executar a CLI atual, que importa `tomllib`.
Embora `pyproject.toml` declare Python 3.10+, a CLI precisa desse módulo.
Para o frontend, use Node.js 22, como no workflow do projeto, e npm.

Na raiz do seu clone, prepare o ambiente Python e instale as dependências,
incluindo o extra de testes definido em `pyproject.toml`:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[test]'
```

No PowerShell, ative o ambiente com `.venv\Scripts\Activate.ps1`.

Processe os dados de uma UF; substitua `RO` pela sigla desejada:

```bash
python -m edu_panorama generate --uf RO --years 2020:2025
```

O comando baixa os arquivos oficiais do Inep e consulta o IBGE. Os arquivos brutos
são grandes: reserve espaço em disco e tempo para o processamento. O cache fica
em `data/raw/`; as saídas consumidas pelo Vue ficam em `frontend/public/data/`.
Se as saídas da UF já estiverem disponíveis no clone, você pode executar a interface
sem reprocessar. Ao gerar dados para validar uma alteração, revise o diff para não
incluir saídas que não façam parte da contribuição.

Em outro terminal, na raiz do projeto, inicie o frontend:

```bash
cd frontend
npm install
npm run dev
```

Abra a URL informada pelo Vite. Para compilar, execute `npm run build` nesse mesmo
diretório.

Execute os testes relevantes à sua alteração:

```bash
# Na raiz, com o ambiente virtual Python ativo:
python -m pytest -q

# A partir da raiz, para os testes JavaScript:
cd frontend
npm test

# No diretório frontend, para os testes de navegador:
npx playwright install chromium webkit
npm run test:e2e
```

Os testes Python usam bases fictícias e não exigem baixar os ZIPs oficiais.
Os testes de navegador incluem perfis móveis emulados; alterações relacionadas a
teclado virtual e gestos também devem ser conferidas em aparelhos reais, quando
houver acesso a eles.

## Fluxo de contribuição

1. Consulte as [Issues existentes](https://github.com/hewerthomn/panorama-educacao/issues) para evitar trabalho duplicado.
2. Abra uma Issue para relatar bugs, sugerir melhorias ou discutir mudanças maiores.
3. Crie um fork do [repositório](https://github.com/hewerthomn/panorama-educacao) e clone seu fork.
4. Crie uma branch para a alteração, por exemplo `git switch -c feat/novo-indicador`.
5. Implemente a contribuição, execute os testes relevantes e revise o diff.
6. Abra um Pull Request do seu fork para a branch `main` do projeto. Explique o que mudou, como validou e vincule a Issue, se houver.

Recomendamos Conventional Commits para tornar o histórico fácil de consultar:

```text
feat: adiciona indicador educacional
fix: corrige filtro de municípios
docs: atualiza documentação
```

## Reportar problemas e sugerir melhorias

Antes de abrir uma Issue, consulte as [Issues existentes](https://github.com/hewerthomn/panorama-educacao/issues).
Se ainda não houver um relato relacionado, use
[Reportar problema ou sugerir melhoria](https://github.com/hewerthomn/panorama-educacao/issues/new).

Para **bugs**, inclua a descrição do problema, os passos para reproduzir,
o comportamento esperado e o observado, o navegador e o dispositivo.
Screenshots ajudam quando o problema é visual; evite expor informações pessoais.

Para **sugestões**, descreva a funcionalidade ou melhoria, o problema que ela
resolveria e os benefícios esperados. Acrescente exemplos ou referências, se houver.

Para **inconsistências nos dados**, informe também UF, município, ano, indicador
e a fonte utilizada para comparação, quando conhecidos. Links para a publicação
oficial e a definição do indicador ajudam a investigar o cálculo.

## Integridade dos dados

- Use fontes oficiais verificáveis e documente sua origem e metodologia.
- Não invente valores para preencher dados ausentes.
- Diferencie zero válido, ausência de informação e não aplicável; nunca converta automaticamente ausências em zero.
- Documente mudanças nas definições e nos questionários ao longo dos anos, sem presumir equivalência entre campos diferentes.
- Valide cálculos e agregações com contagens absolutas e denominadores válidos; evite médias simples de percentuais municipais e duplicação de escolas.
- Evite dados pessoais; não inclua informações de alunos, docentes ou credenciais em arquivos, exemplos ou relatos.
- Não versione arquivos brutos volumosos do Inep nem o cache de `data/raw/`.
- Preserve a compatibilidade entre as saídas Python e o frontend Vue. Mudanças necessárias no formato devem ser discutidas e tratadas em conjunto.
- Mantenha a arquitetura estática, sem dependência obrigatória de backend.

## Novas fontes de desempenho educacional

Mantenha índices numéricos fora do catálogo booleano de infraestrutura. Para alterar
as fontes do Ideb, inspecione os arquivos oficiais e atualize o [mapeamento](docs/ideb.md),
fixtures e testes. Não derive notas territoriais de médias escolares, nem preencha
restrições de divulgação. Preserve a identidade por código, edição, etapa e rede.
Mudanças de contrato exigem nova versão em `edu_panorama/ideb/catalog.py` e no
consumidor Vue. Gere novamente a UF, confira `ideb status` e uma amostra real antes
de versionar somente as saídas publicáveis; mantenha ZIPs e planilhas no cache ignorado.

## Checklist do Pull Request

- [ ] A alteração está descrita.
- [ ] Os testes relevantes foram executados.
- [ ] Não foram identificadas regressões.
- [ ] Alterações visuais possuem screenshots, quando aplicável.
- [ ] Novos indicadores possuem fonte e metodologia documentadas.
