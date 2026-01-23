module.exports = {
    ignoreFiles: [
        'circle.yml',
        'package-lock.json',
        'install_linux.sh',
        'translators',
        '.idea',
        'workspace.code-workspace',
    ],
    run: {
        startUrl: [
            'about:debugging',
            'https://ieeexplore.ieee.org/abstract/document/893874',
            'https://arxiv.org/a/diez_t_1.html',
        ],
        browserConsole: true,
    },
    build: {
        overwriteDest: true,
    },
}
