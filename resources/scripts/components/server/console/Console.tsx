import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ITerminalOptions, Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SearchAddon } from 'xterm-addon-search';
import { SearchBarAddon } from 'xterm-addon-search-bar';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { ScrollDownHelperAddon } from '@/plugins/XtermScrollDownHelperAddon';
import SpinnerOverlay from '@/components/elements/SpinnerOverlay';
import { ServerContext } from '@/state/server';
import { usePermissions } from '@/plugins/usePermissions';
import useEventListener from '@/plugins/useEventListener';
import { debounce } from 'debounce';
import { usePersistedState } from '@/plugins/usePersistedState';
import { SocketEvent, SocketRequest } from '@/components/server/events';
import classNames from 'classnames';
import { ChevronDoubleRightIcon } from '@heroicons/react/solid';

import 'xterm/css/xterm.css';

const theme = {
    background: 'rgba(15, 17, 23, 0.78)',
    foreground: '#F5F7FA',

    cursor: '#4CC2FF',
    cursorAccent: '#0F1117',

    selection: 'rgba(76, 194, 255, 0.25)',

    black: '#0F1117',
    red: '#FF6B81',
    green: '#7EE787',
    yellow: '#FFD866',
    blue: '#6CB6FF',
    magenta: '#D2A8FF',
    cyan: '#79E2F2',
    white: '#D9E0E8',

    brightBlack: '#6B7280',
    brightRed: '#FF7B95',
    brightGreen: '#A5F3AD',
    brightYellow: '#FFE08A',
    brightBlue: '#93C5FD',
    brightMagenta: '#E9B8FF',
    brightCyan: '#A5F3FC',
    brightWhite: '#FFFFFF',
};

const terminalProps: ITerminalOptions = {
    disableStdin: true,
    cursorStyle: 'bar',
    cursorBlink: true,
    allowTransparency: true,

    fontSize: 13,
    lineHeight: 1.45,
    letterSpacing: 0.4,

    fontFamily:
        '"Cascadia Code", "JetBrains Mono", "Fira Code", Consolas, monospace',

    rows: 30,
    smoothScrollDuration: 120,

    theme: theme,
};

export default () => {
    const TERMINAL_PRELUDE = '\u001b[1m\u001b[36mcontainer@pterodactyl~ \u001b[0m';

    const ref = useRef<HTMLDivElement>(null);

    const terminal = useMemo(
        () => new Terminal({ ...terminalProps }),
        []
    );

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    const searchBar = new SearchBarAddon({ searchAddon });
    const webLinksAddon = new WebLinksAddon();
    const scrollDownHelperAddon = new ScrollDownHelperAddon();

    const { connected, instance } = ServerContext.useStoreState(
        (state) => state.socket
    );

    const [canSendCommands] = usePermissions(['control.console']);

    const serverId = ServerContext.useStoreState(
        (state) => state.server.data!.id
    );

    const isTransferring = ServerContext.useStoreState(
        (state) => state.server.data!.isTransferring
    );

    const [history, setHistory] = usePersistedState<string[]>(
        `${serverId}:command_history`,
        []
    );

    const [historyIndex, setHistoryIndex] = useState(-1);

    const handleConsoleOutput = (
        line: string,
        prelude = false
    ) =>
        terminal.writeln(
            (prelude ? TERMINAL_PRELUDE : '') +
                line.replace(/(?:\r\n|\r|\n)$/im, '') +
                '\u001b[0m'
        );

    const handleTransferStatus = (status: string) => {
        switch (status) {
            case 'failure':
                terminal.writeln(
                    TERMINAL_PRELUDE +
                        '\u001b[31mTransfer has failed.\u001b[0m'
                );
                return;

            case 'archive':
                terminal.writeln(
                    TERMINAL_PRELUDE +
                        '\u001b[33mServer archived successfully, reconnecting...\u001b[0m'
                );
        }
    };

    const handleDaemonErrorOutput = (line: string) =>
        terminal.writeln(
            TERMINAL_PRELUDE +
                '\u001b[1m\u001b[41m' +
                line.replace(/(?:\r\n|\r|\n)$/im, '') +
                '\u001b[0m'
        );

    const handlePowerChangeEvent = (state: string) =>
        terminal.writeln(
            TERMINAL_PRELUDE +
                '\u001b[36mServer marked as ' +
                state +
                '...\u001b[0m'
        );

    const handleCommandKeyDown = (
        e: React.KeyboardEvent<HTMLInputElement>
    ) => {
        if (e.key === 'ArrowUp') {
            const newIndex = Math.min(
                historyIndex + 1,
                history!.length - 1
            );

            setHistoryIndex(newIndex);

            e.currentTarget.value =
                history![newIndex] || '';

            e.preventDefault();
        }

        if (e.key === 'ArrowDown') {
            const newIndex = Math.max(
                historyIndex - 1,
                -1
            );

            setHistoryIndex(newIndex);

            e.currentTarget.value =
                history![newIndex] || '';
        }

        const command = e.currentTarget.value;

        if (e.key === 'Enter' && command.length > 0) {
            setHistory((prevHistory) =>
                [command, ...prevHistory!].slice(0, 32)
            );

            setHistoryIndex(-1);

            instance &&
                instance.send('send command', command);

            e.currentTarget.value = '';
        }
    };

    useEffect(() => {
        const style = document.createElement('style');

        style.innerHTML = `
            .windows-terminal {
                border-radius: 22px;
                overflow: hidden;

                border: 1px solid rgba(255,255,255,0.06);

                background:
                    linear-gradient(
                        180deg,
                        rgba(255,255,255,0.04),
                        rgba(255,255,255,0.01)
                    );

                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);

                box-shadow:
                    0 10px 40px rgba(0,0,0,0.45),
                    inset 0 1px 0 rgba(255,255,255,0.04);

                transition: all .25s ease;
            }

            .windows-terminal:hover {
                border-color: rgba(76,194,255,0.18);
            }

            .windows-terminal-container {
                background: rgba(15,17,23,0.78);

                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);

                min-height: 520px;
            }

            .windows-terminal-content {
                padding: 18px;
                height: 100%;
            }

            .windows-terminal-input-wrapper {
                position: relative;

                padding: 14px;

                border-top:
                    1px solid rgba(255,255,255,0.05);

                background:
                    rgba(15,17,23,0.72);

                backdrop-filter: blur(18px);
            }

            .windows-terminal-input {
                width: 100%;

                background:
                    rgba(22,27,34,0.82);

                border:
                    1px solid rgba(255,255,255,0.06);

                border-radius: 16px;

                padding:
                    14px 18px 14px 48px;

                color: #F5F7FA;

                font-size: 13px;
                font-weight: 500;

                outline: none;

                transition: all .22s ease;
            }

            .windows-terminal-input::placeholder {
                color: rgba(255,255,255,0.35);
            }

            .windows-terminal-input:focus {
                border-color:
                    rgba(76,194,255,0.45);

                background:
                    rgba(30,36,46,0.92);

                box-shadow:
                    0 0 0 4px rgba(76,194,255,0.12),
                    0 10px 25px rgba(0,0,0,0.35);
            }

            .windows-terminal-icon {
                position: absolute;

                left: 28px;
                top: 50%;

                transform: translateY(-50%);

                color:
                    rgba(76,194,255,0.85);

                transition: all .2s ease;
            }

            .windows-terminal-input:focus
            + .windows-terminal-icon {
                color: #4CC2FF;

                transform:
                    translateY(-50%)
                    scale(1.08);
            }

            .xterm {
                padding: 4px;
            }

            .xterm-viewport {
                overflow-y: auto !important;
                scrollbar-width: thin;
            }

            .xterm-viewport::-webkit-scrollbar {
                width: 8px;
            }

            .xterm-viewport::-webkit-scrollbar-thumb {
                background:
                    rgba(255,255,255,0.12);

                border-radius: 999px;
            }

            .xterm-viewport::-webkit-scrollbar-thumb:hover {
                background:
                    rgba(255,255,255,0.22);
            }

            .xterm-screen canvas {
                filter:
                    drop-shadow(
                        0 0 2px
                        rgba(76,194,255,0.08)
                    );
            }

            .xterm-rows {
                text-shadow:
                    0 0 2px rgba(255,255,255,0.02),
                    0 0 8px rgba(76,194,255,0.03);
            }

            .xterm-search-bar {
                background:
                    rgba(22,27,34,0.95) !important;

                border:
                    1px solid rgba(255,255,255,0.08) !important;

                border-radius: 14px !important;

                backdrop-filter: blur(14px);
            }
        `;

        document.head.appendChild(style);

        return () => {
            document.head.removeChild(style);
        };
    }, []);

    useEffect(() => {
        if (
            connected &&
            ref.current &&
            !terminal.element
        ) {
            terminal.loadAddon(fitAddon);
            terminal.loadAddon(searchAddon);
            terminal.loadAddon(searchBar);
            terminal.loadAddon(webLinksAddon);
            terminal.loadAddon(scrollDownHelperAddon);

            terminal.open(ref.current);

            fitAddon.fit();

            terminal.attachCustomKeyEventHandler(
                (e: KeyboardEvent) => {
                    if (
                        (e.ctrlKey || e.metaKey) &&
                        e.key === 'c'
                    ) {
                        document.execCommand('copy');
                        return false;
                    }

                    if (
                        (e.ctrlKey || e.metaKey) &&
                        e.key === 'f'
                    ) {
                        e.preventDefault();
                        searchBar.show();
                        return false;
                    }

                    if (e.key === 'Escape') {
                        searchBar.hidden();
                    }

                    return true;
                }
            );
        }
    }, [terminal, connected]);

    useEventListener(
        'resize',
        debounce(() => {
            if (terminal.element) {
                fitAddon.fit();
            }
        }, 100)
    );

    useEffect(() => {
        const listeners: Record<
            string,
            (s: string) => void
        > = {
            [SocketEvent.STATUS]:
                handlePowerChangeEvent,

            [SocketEvent.CONSOLE_OUTPUT]:
                handleConsoleOutput,

            [SocketEvent.INSTALL_OUTPUT]:
                handleConsoleOutput,

            [SocketEvent.TRANSFER_LOGS]:
                handleConsoleOutput,

            [SocketEvent.TRANSFER_STATUS]:
                handleTransferStatus,

            [SocketEvent.DAEMON_MESSAGE]:
                (line) =>
                    handleConsoleOutput(
                        line,
                        true
                    ),

            [SocketEvent.DAEMON_ERROR]:
                handleDaemonErrorOutput,
        };

        if (connected && instance) {
            if (!isTransferring) {
                terminal.clear();
            }

            Object.keys(listeners).forEach(
                (key: string) => {
                    instance.addListener(
                        key,
                        listeners[key]
                    );
                }
            );

            instance.send(
                SocketRequest.SEND_LOGS
            );
        }

        return () => {
            if (instance) {
                Object.keys(listeners).forEach(
                    (key: string) => {
                        instance.removeListener(
                            key,
                            listeners[key]
                        );
                    }
                );
            }
        };
    }, [connected, instance]);

    return (
        <div
            className={
                'windows-terminal relative'
            }
        >
            <SpinnerOverlay
                visible={!connected}
                size={'large'}
            />

            <div
                className={
                    'windows-terminal-container'
                }
            >
                <div
                    className={
                        'windows-terminal-content'
                    }
                >
                    <div
                        ref={ref}
                        style={{
                            height: '100%',
                        }}
                    />
                </div>
            </div>

            {canSendCommands && (
                <div
                    className={
                        'windows-terminal-input-wrapper'
                    }
                >
                    <input
                        className={
                            'windows-terminal-input'
                        }
                        type={'text'}
                        placeholder={
                            'Type a command...'
                        }
                        aria-label={
                            'Console command input.'
                        }
                        disabled={
                            !instance ||
                            !connected
                        }
                        onKeyDown={
                            handleCommandKeyDown
                        }
                        autoCorrect={'off'}
                        autoCapitalize={'none'}
                    />

                    <div
                        className={
                            'windows-terminal-icon'
                        }
                    >
                        <ChevronDoubleRightIcon
                            className={'w-4 h-4'}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};