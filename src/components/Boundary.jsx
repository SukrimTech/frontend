import { Component } from 'react'

/*
  A render error in one panel should not blank the page.

  The workbench exists to be driven into unusual states — a network with a
  component detached, an element edited to something the renderer has not seen
  — and a thrown error there costs the user every edit they had made, because
  the session lives in the component tree above it. Catching it locally keeps
  the chat, the edit log and the session alive, and says what broke.
*/
export default class Boundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Kept in the console for a developer; the user gets the message below.
    console.error('panel failed:', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="boundary">
        <strong>{this.props.label ?? 'This panel'} could not be drawn.</strong>
        <p className="mono">{String(this.state.error?.message ?? this.state.error)}</p>
        <p className="note">
          Your session and edits are intact. Undo the last change, or reload to
          redraw.
        </p>
        <button className="chip" onClick={() => this.setState({ error: null })}>
          try again
        </button>
      </div>
    )
  }
}
