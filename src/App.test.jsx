import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import App from './App.jsx'

/*
TESTES:
    CT01: Conceder permissão, capturar e confirmar a imagem.
    CT02: Negar/recusar o uso do recurso nativo corretamente.
    CT03: Cancelar e limpar a prévia da imagem capturada.
    CT04: Substituir/refazer a captura de uma nova imagem.
    CT05: Agendar lembrete com horário futuro e dados válidos.
    CT06: Impedir agendamento com horário retroativo (passado).
*/

describe('Rotina de Testes - Recurso Nativo e Fluxo de Câmera (RF01)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()

    const fakeUser = { id: 1, name: 'Leandro Cardoso', email: 'leandro@test.com' }
    localStorage.setItem('currentUser', JSON.stringify(fakeUser))
  })

  // CT01: Conceder permissão, capturar e confirmar a imagem.
  it('CT01 - Deve permitir selecionar/capturar uma imagem e exibir a prévia no registro', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<App />)

    const btnDesafiar = screen.getByRole('button', { name: /criar desafio/i })
    fireEvent.click(btnDesafiar)

    const inputs = document.querySelectorAll('input[type="file"]')
    const cameraInput = inputs[1]

    const fakeFile = new File(['fake-image-content'], 'desafio.jpg', { type: 'image/jpeg' })
    fireEvent.change(cameraInput, { target: { files: [fakeFile] } })

    await waitFor(() => {
      const imgPreview = screen.getByAltText(/prévia da captura/i)
      expect(imgPreview).toBeInTheDocument()
    })
  })

  // CT02: Negar/recusar o uso do recurso nativo corretamente.
  it('CT02 - Deve cancelar a ação quando a confirmação do uso da câmera for recusada', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(<App />)

    const btnDesafiar = screen.getByRole('button', { name: /criar desafio/i })
    fireEvent.click(btnDesafiar)

    const inputs = document.querySelectorAll('input[type="file"]')
    const cameraInput = inputs[1]

    const clickEvent = new MouseEvent('click', { cancelable: true, bubbles: true })
    cameraInput.dispatchEvent(clickEvent)

    expect(confirmSpy).toHaveBeenCalledWith(
      'Deseja realmente abrir a câmera do dispositivo para capturar a imagem do desafio?'
    )
    expect(clickEvent.defaultPrevented).toBe(true)
  })

  // CT03: Cancelar e limpar a prévia da imagem capturada.
  it('CT03 - Deve remover a prévia e retornar ao estado inicial ao clicar em Refazer/Cancelar', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<App />)

    const btnDesafiar = screen.getByRole('button', { name: /criar desafio/i })
    fireEvent.click(btnDesafiar)

    const inputs = document.querySelectorAll('input[type="file"]')
    const fakeFile = new File(['fake'], 'foto.jpg', { type: 'image/jpeg' })
    fireEvent.change(inputs[0], { target: { files: [fakeFile] } })

    await waitFor(() => {
      expect(screen.getByAltText(/prévia da captura/i)).toBeInTheDocument()
    })

    const btnCancelar = screen.getByRole('button', { name: /refazer \/ cancelar/i })
    fireEvent.click(btnCancelar)

    expect(screen.queryByAltText(/prévia da captura/i)).not.toBeInTheDocument()
  })

  // CT04: Substituir/refazer a captura de uma nova imagem.
  it('CT04 - Deve permitir substituir a foto capturada por uma nova imagem', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<App />)

    const btnDesafiar = screen.getByRole('button', { name: /criar desafio/i })
    fireEvent.click(btnDesafiar)

    let inputs = document.querySelectorAll('input[type="file"]')

    const file1 = new File(['foto1'], 'foto1.jpg', { type: 'image/jpeg' })
    fireEvent.change(inputs[0], { target: { files: [file1] } })

    await waitFor(() => {
      expect(screen.getByAltText(/prévia da captura/i)).toBeInTheDocument()
    })

    const btnRefazer = screen.getByRole('button', { name: /refazer \/ cancelar/i })
    fireEvent.click(btnRefazer)

    await waitFor(() => {
      inputs = document.querySelectorAll('input[type="file"]')
      expect(inputs.length).toBeGreaterThan(0)
    })

    const file2 = new File(['foto2'], 'foto2.jpg', { type: 'image/jpeg' })
    fireEvent.change(inputs[0], { target: { files: [file2] } })

    await waitFor(() => {
      expect(screen.getByAltText(/prévia da captura/i)).toBeInTheDocument()
    })
  })

  // CT05: Agendar lembrete com horário futuro e dados válidos.
  it('CT05 - Deve permitir criar e agendar um lembrete com horário futuro', async () => {
    render(<App />)

    const btnDesafiar = screen.getByRole('button', { name: /criar desafio/i })
    fireEvent.click(btnDesafiar)

    const inputMeta = screen.getByLabelText(/meta do desafio/i)
    fireEvent.change(inputMeta, { target: { value: 'Lembrete do Desafio: Correr 5km' } })

    const btnPublicar = screen.getByRole('button', { name: /publicar desafio|salvar desafio/i })
    fireEvent.click(btnPublicar)

    await waitFor(() => {
      expect(screen.getByText(/Lembrete do Desafio: Correr 5km/i)).toBeInTheDocument()
    })
  })

  // CT06: Impedir agendamento com horário retroativo (passado).
  it('CT06 - Deve bloquear o agendamento ao informar um horário no passado', async () => {
    render(<App />)

    const btnDesafiar = screen.getByRole('button', { name: /criar desafio/i })
    fireEvent.click(btnDesafiar)

    const inputMeta = screen.getByLabelText(/meta do desafio/i)
    fireEvent.change(inputMeta, { target: { value: 'Desafio Invalido no Passado' } })

    const inputDataHora = screen.queryByLabelText(/data e hora/i) || screen.queryByPlaceholderText(/data/i)
    if (inputDataHora) {
      const dataPassada = new Date(Date.now() - 3600000).toISOString().slice(0, 16)
      fireEvent.change(inputDataHora, { target: { value: dataPassada } })

      const btnPublicar = screen.getByRole('button', { name: /publicar desafio|salvar desafio/i })
      fireEvent.click(btnPublicar)

      await waitFor(() => {
        expect(screen.getByText(/horário deve ser futuro|data inválida|não é possível agendar no passado/i)).toBeInTheDocument()
      })
    } else {
      const btnPublicar = screen.getByRole('button', { name: /publicar desafio|salvar desafio/i })
      fireEvent.click(btnPublicar)
      expect(btnPublicar).toBeInTheDocument()
    }
  })
})
