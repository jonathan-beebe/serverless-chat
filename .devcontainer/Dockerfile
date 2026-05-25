FROM node:22

ARG TZ
ENV TZ="$TZ"

ARG CLAUDE_CODE_VERSION=latest

# Install basic development tools and iptables/ipset
RUN apt-get update && apt-get install -y --no-install-recommends \
  less \
  git \
  procps \
  sudo \
  fzf \
  zsh \
  man-db \
  unzip \
  gnupg2 \
  gh \
  iptables \
  ipset \
  iproute2 \
  dnsutils \
  aggregate \
  jq \
  nano \
  vim \
  tmux \
  bat \
  ripgrep \
  fd-find \
  zoxide \
  btop \
  tldr \
  duf \
  direnv \
  && apt-get clean && rm -rf /var/lib/apt/lists/* \
  && ln -s /usr/bin/batcat /usr/local/bin/bat \
  && ln -s /usr/bin/fdfind /usr/local/bin/fd

# Ensure default node user has access to /usr/local/share
RUN mkdir -p /usr/local/share/npm-global && \
  chown -R node:node /usr/local/share

ARG USERNAME=node

# Persist bash history.
RUN SNIPPET="export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
  && mkdir /commandhistory \
  && touch /commandhistory/.bash_history \
  && chown -R $USERNAME /commandhistory

# Set `DEVCONTAINER` environment variable to help with orientation
ENV DEVCONTAINER=true

# Create workspace and config directories and set permissions
RUN mkdir -p /workspace /home/node/.claude && \
  chown -R node:node /workspace /home/node/.claude

WORKDIR /workspace

ARG GIT_DELTA_VERSION=0.18.2
RUN ARCH=$(dpkg --print-architecture) && \
  wget "https://github.com/dandavison/delta/releases/download/${GIT_DELTA_VERSION}/git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
  sudo dpkg -i "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
  rm "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb"

# Install modern CLI tools from GitHub releases:
# neovim, eza, lazygit, lazydocker, dust.
# All published at the same `latest/download/` redirect path so the build
# tracks upstream stable; bump pins here if you need reproducibility.
RUN set -eux; \
  ARCH=$(dpkg --print-architecture); \
  case "$ARCH" in \
    amd64) NVIM_ARCH=x86_64; RUST_ARCH=x86_64-unknown-linux-gnu; LG_ARCH=x86_64 ;; \
    arm64) NVIM_ARCH=arm64;  RUST_ARCH=aarch64-unknown-linux-gnu; LG_ARCH=arm64 ;; \
    *) echo "Unsupported arch: $ARCH" >&2; exit 1 ;; \
  esac; \
  # neovim
  wget -qO- "https://github.com/neovim/neovim/releases/latest/download/nvim-linux-${NVIM_ARCH}.tar.gz" \
    | tar xz -C /opt; \
  ln -s "/opt/nvim-linux-${NVIM_ARCH}/bin/nvim" /usr/local/bin/nvim; \
  # eza
  wget -qO- "https://github.com/eza-community/eza/releases/latest/download/eza_${RUST_ARCH}.tar.gz" \
    | tar xz -C /usr/local/bin; \
  # lazygit (release URL embeds the version, so fetch it from the API)
  LG_VER=$(wget -qO- https://api.github.com/repos/jesseduffield/lazygit/releases/latest \
    | grep -oP '"tag_name":\s*"v\K[^"]+'); \
  wget -qO- "https://github.com/jesseduffield/lazygit/releases/latest/download/lazygit_${LG_VER}_Linux_${LG_ARCH}.tar.gz" \
    | tar xz -C /usr/local/bin lazygit; \
  # lazydocker (same pattern)
  LD_VER=$(wget -qO- https://api.github.com/repos/jesseduffield/lazydocker/releases/latest \
    | grep -oP '"tag_name":\s*"v\K[^"]+'); \
  wget -qO- "https://github.com/jesseduffield/lazydocker/releases/latest/download/lazydocker_${LD_VER}_Linux_${LG_ARCH}.tar.gz" \
    | tar xz -C /usr/local/bin lazydocker; \
  # dust (tarball nests the binary under a versioned dir)
  DUST_VER=$(wget -qO- https://api.github.com/repos/bootandy/dust/releases/latest \
    | grep -oP '"tag_name":\s*"v\K[^"]+'); \
  DUST_DIR="dust-v${DUST_VER}-${RUST_ARCH}"; \
  wget -qO- "https://github.com/bootandy/dust/releases/latest/download/${DUST_DIR}.tar.gz" \
    | tar xz --strip-components=1 -C /usr/local/bin "${DUST_DIR}/dust"

# Set up non-root user
USER node

# Install global packages
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=$PATH:/usr/local/share/npm-global/bin

# Keep npm quiet — no funding/audit noise on every install
RUN npm config set fund false && npm config set audit false

# Set the default shell to zsh rather than sh
ENV SHELL=/bin/zsh

# Set the default editor and visual
ENV EDITOR=nano
ENV VISUAL=nano

# Set git's default editor to vim
RUN git config --global core.editor "vim"

# Default powerline10k theme
ARG ZSH_IN_DOCKER_VERSION=1.2.0
RUN sh -c "$(wget -O- https://github.com/deluan/zsh-in-docker/releases/download/v${ZSH_IN_DOCKER_VERSION}/zsh-in-docker.sh)" -- \
  -p git \
  -p fzf \
  -a "source /usr/share/doc/fzf/examples/key-bindings.zsh" \
  -a "source /usr/share/doc/fzf/examples/completion.zsh" \
  -a "export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
  -x

# Alias `claude` to always run permissively inside the container.
# The CLI's own root-check is the safety net; `remoteUser` is non-root `node`.
RUN echo "alias claude='claude --dangerously-skip-permissions'" >> /home/node/.zshrc

# Shell integrations for the modern CLI tools.
# Starship is appended last so it overrides the powerlevel10k theme that
# zsh-in-docker installed above.
RUN { \
  echo ''; \
  echo '# zoxide (provides `z` for smart `cd`)'; \
  echo 'eval "$(zoxide init zsh)"'; \
  echo ''; \
  echo '# direnv (per-directory env)'; \
  echo 'eval "$(direnv hook zsh)"'; \
} >> /home/node/.zshrc

# Install Claude
RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}


# Copy and set up firewall script
COPY init-firewall.sh /usr/local/bin/
USER root
RUN chmod +x /usr/local/bin/init-firewall.sh && \
  echo "node ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh" > /etc/sudoers.d/node-firewall && \
  chmod 0440 /etc/sudoers.d/node-firewall
USER node
