/**
 * ⚔️ Spam Illimitato
 *
 * @description Permette di uppare automaticamente una lista di forum
 * con intervallo di 20 secondi tra un forum e l'altro.
 * Al completamento di tutti i forum, pubblica automaticamente la richiesta ricompense.
 *
 * @requires HxHFramework
 * @requires HxHFramework.constants.JSONBIN_MASTER_KEY
 */

;(function() {
    'use strict';

    if (!window.HxHFramework) { console.warn('[SpamUnlimited] HxHFramework non trovato!'); return; }

    var F = window.HxHFramework;

    F.utilities.waitFor(
        function() { return window.SPAM_UNLIMITED_CONFIG && F.constants.JSONBIN_MASTER_KEY !== null; },
        function() {

        var config               = window.SPAM_UNLIMITED_CONFIG;
        var forums               = config.forums;
        var spamMessage          = config.spamMessage;
        var binId                = config.binId;
        var API_KEY              = F.constants.JSONBIN_MASTER_KEY;
        var rewardForum          = config.rewardForum;
        var rewardMessageTemplate = config.rewardMessageTemplate;

        var API_URL = 'https://api.jsonbin.io/v3/b/' + binId;

        // -----------------------------------------------
        //  DOM REFS
        // -----------------------------------------------
        var header      = document.getElementById('headerUnlimited');
        var content     = document.getElementById('contentUnlimited');
        var grid        = document.getElementById('forumGridUnlimited');
        var status      = document.getElementById('statusUnlimited');
        var statusText  = document.getElementById('statusTextUnlimited');
        var progressBar = document.getElementById('progressBarUnlimited');
        var submitBtn   = document.getElementById('submitSelectedUnlimited');
        var stopBtn     = document.getElementById('stopProcessUnlimited');
        var lastUserDiv = document.getElementById('lastUserUnlimited');

        content.appendChild(lastUserDiv);

        var isRunning  = false;
        var shouldStop = false;

        // -----------------------------------------------
        //  TOGGLE HEADER
        // -----------------------------------------------
        header.addEventListener('click', function() {
            content.classList.toggle('expanded');
            header.textContent = content.classList.contains('expanded')
                ? 'SPAM ILLIMITATO - Clicca per comprimere'
                : 'SPAM ILLIMITATO - Clicca per espandere';
        });

        // -----------------------------------------------
        //  JSONBIN
        // -----------------------------------------------
        function checkLastSpam() {
            fetch(API_URL + '/latest', {
                method: 'GET',
                headers: { 'X-Master-Key': API_KEY }
            })
            .then(function(r) { return r.json(); })
            .then(function(response) {
                var record = response.record;
                if (record && record.lastSpam && record.spammedBy) {
                    var date = new Date(record.lastSpam).toLocaleString('it-IT');
                    lastUserDiv.innerHTML = 'Ultimo spam: <strong>' + record.spammedBy + '</strong> il ' + date;
                    lastUserDiv.style.display = 'block';
                }
            })
            .catch(function(e) { console.error('[SpamUnlimited] checkLastSpam:', e); });
        }

        function updateLastSpam(username) {
            fetch(API_URL, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Master-Key': API_KEY
                },
                body: JSON.stringify({
                    lastSpam:  new Date().toISOString(),
                    spammedBy: username
                })
            })
            .catch(function(e) { console.error('[SpamUnlimited] updateLastSpam:', e); });
        }

        // -----------------------------------------------
        //  FORUM GRID
        // -----------------------------------------------
        for (var i = 0; i < forums.length; i++) {
            var forum = forums[i];
            var div   = document.createElement('div');
            div.className = 'forum-item';
            div.id        = 'forum-unlimited-' + i;
            div.innerHTML = '<label><input type="checkbox" value="' + i + '" class="forum-checkbox-unlimited">'
                          + forum.name + '</label><span class="status-badge"></span>';
            grid.appendChild(div);
        }

        grid.querySelectorAll('.forum-checkbox-unlimited').forEach(function(cb) {
            cb.addEventListener('change', function() {
                this.parentElement.parentElement.classList.toggle('checked', this.checked);
            });
        });

        document.getElementById('selectAllUnlimited').addEventListener('click', function() {
            if (isRunning) return;
            grid.querySelectorAll('.forum-checkbox-unlimited').forEach(function(cb) {
                cb.checked = true;
                cb.parentElement.parentElement.classList.add('checked');
            });
        });

        document.getElementById('deselectAllUnlimited').addEventListener('click', function() {
            if (isRunning) return;
            grid.querySelectorAll('.forum-checkbox-unlimited').forEach(function(cb) {
                cb.checked = false;
                cb.parentElement.parentElement.classList.remove('checked');
            });
        });

        // -----------------------------------------------
        //  SUBMIT A FORUM (popup)
        // -----------------------------------------------
        function submitToForum(forum) {
            var escapedMsg = spamMessage.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

            var w = window.open(forum.url, 'forum' + Math.random().toString(36).substring(7), 'width=800,height=600');
            if (!w) return false;

            w.onload = function() {
                try {
                    var html = w.document.documentElement.outerHTML;
                    var marker = 'name=' + '"s" value="';
                    var start = html.indexOf(marker);
                    if (start === -1) return;
                    start += marker.length;
                    var token = html.substring(start, html.indexOf('"', start));
                    var fd = new w.FormData();
                    fd.set('st', '0');
                    fd.set('act', 'Post');
                    fd.set('s', token);
                    fd.set('CODE', '03');
                    fd.set('f', forum.f);
                    fd.set('t', forum.t);
                    fd.set('Post', spamMessage);
                    fd.set('charset', 'UTF-8');
                    w.fetch(w.location.origin + '/', { method: 'POST', body: fd })
                        .catch(function(e) { console.error('[Spam] Errore post:', e); });
                } catch(e) { console.error('[Spam] Errore popup:', e); }
            };
            return true;
        }
        function submitReward(completedForums) {
            var forumList = completedForums.map(function(idx) {
                return '<b>' + forums[idx].name + '</b>';
            }).join(', ');
            var rewardMessage = rewardMessageTemplate.replace('{forumList}', forumList);

            var w = window.open(rewardForum.url, 'reward' + Math.random().toString(36).substring(7), 'width=800,height=600');
            if (!w) return;

            w.onload = function() {
                try {
                    var html = w.document.documentElement.outerHTML;
                    var marker = 'name=' + '"s" value="';
                    var start = html.indexOf(marker);
                    if (start === -1) return;
                    start += marker.length;
                    var token = html.substring(start, html.indexOf('"', start));
                    var fd = new w.FormData();
                    fd.set('st', '0');
                    fd.set('act', 'Post');
                    fd.set('s', token);
                    fd.set('CODE', '03');
                    fd.set('f', rewardForum.f);
                    fd.set('t', rewardForum.t);
                    fd.set('Post', rewardMessage);
                    fd.set('charset', 'UTF-8');
                    w.fetch(w.location.origin + '/', { method: 'POST', body: fd })
                        .catch(function(e) { console.error('[Spam] Errore reward:', e); });
                } catch(e) { console.error('[Spam] Errore popup reward:', e); }
            };
        }

        // -----------------------------------------------
        //  CSS VAR HELPER
        // -----------------------------------------------
        function cssVar(name) {
            return getComputedStyle(document.documentElement).getPropertyValue(name);
        }

        // -----------------------------------------------
        //  STOP BUTTON
        // -----------------------------------------------
        stopBtn.addEventListener('click', function() {
            shouldStop = true;
            statusText.innerHTML = '<strong style="color:' + cssVar('--sei') + ';">Interruzione in corso...</strong>';
        });

        // -----------------------------------------------
        //  SUBMIT BUTTON
        // -----------------------------------------------
        submitBtn.addEventListener('click', function() {
            var username = (window.Commons && Commons.user && Commons.user.nickname)
                ? Commons.user.nickname
                : null;

            if (!username) {
                username = prompt('Inserisci il tuo username:');
                if (!username || !username.trim()) { alert('Username richiesto per continuare'); return; }
                username = username.trim();
            }

            var selected = [];
            grid.querySelectorAll('.forum-checkbox-unlimited:checked').forEach(function(cb) {
                selected.push(parseInt(cb.value));
            });

            if (selected.length === 0) { alert('Seleziona almeno un forum!'); return; }

            if (!confirm('Vuoi uppare ' + selected.length + ' forum?\n\nVerranno aperte ' + selected.length + ' nuove finestre con un intervallo di 20 secondi.\n\nAssicurati di aver autorizzato i popup!')) return;

            isRunning  = true;
            shouldStop = false;
            submitBtn.disabled = true;
            stopBtn.classList.add('show');
            status.classList.add('show');

            grid.querySelectorAll('.forum-checkbox-unlimited').forEach(function(cb) { cb.disabled = true; });
            grid.querySelectorAll('.forum-item').forEach(function(item) {
                item.classList.remove('processing', 'done');
                item.querySelector('.status-badge').textContent = '';
            });

            var currentIndex    = 0;
            var completedForums = [];

            function resetUI() {
                isRunning = false;
                submitBtn.disabled = false;
                stopBtn.classList.remove('show');
                grid.querySelectorAll('.forum-checkbox-unlimited').forEach(function(cb) { cb.disabled = false; });
            }

            function processNext() {
                if (currentIndex >= selected.length || shouldStop) {
                    var allUpped = completedForums.length === forums.length;

                    if (!shouldStop && completedForums.length === selected.length) {
                        progressBar.style.width = '100%';
                        progressBar.textContent = '100%';

                        if (!allUpped) {
                            statusText.innerHTML = '<strong style="color:' + cssVar('--sei') + ';">Completato, ma non avendo uppato tutti i forum (' + completedForums.length + '/' + forums.length + '), non è possibile richiedere le ricompense.</strong>';
                            updateLastSpam(username);
                            checkLastSpam();
                        } else {
                            updateLastSpam(username);
                            var countdown = 20;
                            var countInterval = setInterval(function() {
                                if (countdown > 0) {
                                    statusText.innerHTML = '<strong style="color:' + cssVar('--sette') + ';">Completato! Pubblicazione ricompensa tra <span style="color:' + cssVar('--due') + ';font-size:18px;">' + countdown + '</span> secondi...</strong>';
                                    countdown--;
                                } else {
                                    clearInterval(countInterval);
                                    checkLastSpam();
                                    submitReward(completedForums);
                                    statusText.innerHTML = '<strong style="color:' + cssVar('--sette') + ';">Completato! Ricompensa pubblicata.</strong><br><small>Puoi chiudere le finestre aperte.</small>';
                                }
                            }, 1000);
                        }
                    } else {
                        statusText.innerHTML = '<strong style="color:' + cssVar('--sei') + ';">Processo interrotto.</strong>';
                    }

                    resetUI();
                    return;
                }

                var forumIndex  = selected[currentIndex];
                var forum       = forums[forumIndex];
                var forumEl     = document.getElementById('forum-unlimited-' + forumIndex);
                var progress    = Math.round(((currentIndex + 1) / selected.length) * 100);

                forumEl.classList.add('processing');
                forumEl.querySelector('.status-badge').textContent = '';
                progressBar.style.width = progress + '%';
                progressBar.textContent = progress + '%';
                statusText.innerHTML = '<strong>Uppando ' + forum.name + '...</strong> (' + (currentIndex + 1) + '/' + selected.length + ')';

                if (!submitToForum(forum)) {
                    alert('Popup bloccato! Autorizza i popup e riprova.');
                    shouldStop = true;
                    processNext();
                    return;
                }

                completedForums.push(forumIndex);
                setTimeout(function() {
                    forumEl.classList.remove('processing');
                    forumEl.classList.add('done');
                    forumEl.querySelector('.status-badge').textContent = '';
                }, 500);

                currentIndex++;

                if (currentIndex < selected.length && !shouldStop) {
                    var countdown = 20;
                    var countInterval = setInterval(function() {
                        if (shouldStop) { clearInterval(countInterval); processNext(); return; }
                        statusText.innerHTML = '<strong>Uppato ' + forum.name + '!</strong><br>Prossimo forum tra <span style="color:' + cssVar('--due') + ';font-size:18px;">' + countdown + '</span> secondi...';
                        countdown--;
                        if (countdown < 0) { clearInterval(countInterval); processNext(); }
                    }, 1000);
                } else {
                    processNext();
                }
            }

            processNext();
        });

        checkLastSpam();

    }); // fine waitFor

})();
