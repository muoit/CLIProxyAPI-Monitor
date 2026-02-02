"use client";

import { Component, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  darkMode: boolean;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

export class SettingsErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    const { darkMode } = this.props;

    if (this.state.hasError) {
      return (
        <div className={`rounded-2xl p-6 shadow-sm ring-1 ${darkMode ? "bg-zinc-800/50 ring-zinc-700" : "bg-white ring-zinc-200"}`}>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className={`text-base font-medium ${darkMode ? "text-rose-400/80" : "text-rose-600"}`}>
              Something went wrong loading settings
            </p>
            <p className={`mt-1 text-sm ${darkMode ? "text-zinc-400" : "text-zinc-600"}`}>
              {this.state.error?.message || "An unexpected error occurred"}
            </p>
            <button
              type="button"
              onClick={this.handleRetry}
              className="mt-4 rounded-lg bg-indigo-500/80 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
