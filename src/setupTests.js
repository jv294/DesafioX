import '@testing-library/jest-dom'

if (typeof window.URL.createObjectURL === 'undefined') {
  window.URL.createObjectURL = () => 'blob:http://localhost/fake-temp-url'
  window.URL.revokeObjectURL = () => {}
}
