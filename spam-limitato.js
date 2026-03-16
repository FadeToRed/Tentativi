/**
 * ⚔️ Spam Ogni 3 Giorni
 *
 * @description Permette di uppare automaticamente una lista di forum
 * con cooldown di 3 giorni, gestione dello stato condiviso tramite jsonBin
 * e blocco durante spam in corso da parte di altri utenti.
 *
 * @requires HxHFramework
 * @requires HxHFramework.constants.JSONBIN_MASTER_KEY
 */

;(function() {
    'use strict';

    if (!window.HxHFramework) { console.warn('[SpamLimited] HxHFramework non trovato!'); return; }

    var F = window.HxHFramework;

    F.utilities.waitFor(
        function() { return window.SPAM_LIMITED_CONFIG && F.constants.JSONBIN_MASTER_KEY !== null; },
        function() {

        var config                = window.SPAM_LIMITED_CONFIG;
        var forums                = config.forums;
        var spamMessage           = config.spamMessage;
        var binId                 = config.binId;
        var API_KEY               = F.constants.JSONBIN_MASTER_KEY;
        var cooldownMinutes       = config.cooldownMinutes;
        var rewardForum           = config.rewardForum;
        var rewardMessageTemplate = config.rewardMessageTemplate;

        var API_URL = 'https://api.jsonbin.io/v3/b/' + binId;

        // -----------------------------------------------
        //  DOM REFS
        // -----------------------------------------------
        var header          = document.getElementById('headerLimited');
        var content         = document.getElementById('contentLimited');
        var grid            = document.getElementById('forumGridLimited');
        var status          = document.getElementById('statusLimited');
        var statusText      = document.getElementById('statusTextLimited');
        var progressBar     = document.getElementById('progressBarLimited');
        var submitBtn       = document.getElementById('submitSelectedLimited');
        var stopBtn         = document.getElementById('stopProcessLimited');
        var cooldownDisplay = document.getElementById('cooldownDisplayLimited');
        var lastUserDiv     = document.getElementById('lastUserLimited');

        content.insertBefore(lastUserDiv, cooldownDisplay);

        var isRunning        = false;
        var shouldStop       = false;
        var countdownInterval = null;

        // -----------------------------------------------
        //  TOGGLE HEADER
        // -----------------------------------------------
        header.addEventListener('click', function() {
            content.classList.toggle('expanded');
            header.textContent = content.classList.contains('expanded')
                ? 'SPAM Ogni 3 giorni - Clicca per comprimere'
                : 'SPAM Ogni 3 giorni - Clicca per espandere';
        });

        // -----------------------------------------------
        //  CSS VAR HELPER
        // -----------------------------------------------
        function cssVar(name) {
            return getComputedStyle(document.documentElement).getPropertyValue(name);
        }

        // -----------------------------------------------
        //  JSONBIN
        // -----------------------------------------------
        function checkSpamStatus(callback) {
            fetch(API_URL + '/latest', {
                method: 'GET',
                headers: { 'X-Master-Key': API_KEY }
            })
            .then(function(r) { return r.json(); })
            .then(function(response) { callback(response.record); })
            .catch(function(e) { console.error('[SpamLimited] checkSpamStatus:', e); });
        }

        function updateSpamStatus(data, callback) {
            fetch(API_URL, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Master-Key': API_KEY
                },
                body: JSON.stringify(data)
            })
            .then(function(r) { callback(r.ok); })
            .catch(function(e) { console.error('[SpamLimited] updateSpamStatus:', e); callback(false); });
        }

        // -----------------------------------------------
        //  COOLDOWN HELPERS
        // -----------------------------------------------
        function getRemainingTime(lastSpamDate) {
            var remaining = (cooldownMinutes * 60 * 1000) - (Date.now() - new Date(lastSpamDate).getTime());
            return remaining > 0 ? remaining : 0;
        }

        function formatTime(ms) {
            var s  = Math.floor(ms / 1000);
            var m  = Math.floor(s / 60);
            var h  = Math.floor(m / 60);
            var d  = Math.floor(h / 24);
            if (d > 0)  return d + 'd ' + (h % 24) + 'h ' + (m % 60) + 'm';
            if (h > 0)  return h + 'h ' + (m % 60) + 'm ' + (s % 60) + 's';
            if (m > 0)  return m + 'm ' + (s % 60) + 's';
            return s + 's';
        }

        // -----------------------------------------------
        //  UI UPDATE
        // -----------------------------------------------
        function updateCountdown(record) {
            if (record && record.spammedBy) {
                var date = record.lastSpam ? new Date(record.lastSpam).toLocaleString('it-IT') : 'in corso...';
                lastUserDiv.innerHTML = 'Ultimo spam: <strong>' + record.spammedBy + '</strong> il ' + date;
                lastUserDiv.style.display = 'block';
            }

            if (record && record.inProgress && !isRunning) {
                submitBtn.disabled = true;
                cooldownDisplay.style.display = 'block';
                cooldownDisplay.innerHTML = '<strong style="color:' + cssVar('--sei') + ';">Spam in corso</strong><br>'
                    + '<strong>' + record.spammedBy + '</strong> sta già effettuando lo spam. Attendi che finisca.';
                return;
            }

            if (!record || !record.lastSpam || !record.allCompleted) {
                cooldownDisplay.style.display = 'none';
                if (!isRunning) submitBtn.disabled = !!(record && record.inProgress);
                return;
            }

            var remaining = getRemainingTime(record.lastSpam);
            if (remaining > 0) {
                cooldownDisplay.style.display = 'block';
                cooldownDisplay.innerHTML = '<strong style="color:' + cssVar('--sei') + ';">Spam bloccato</strong><br>'
                    + 'Ultimo spam da <strong>' + record.spammedBy + '</strong> il ' + new Date(record.lastSpam).toLocaleString('it-IT') + '<br>'
                    + 'Tempo rimanente: <span style="color:' + cssVar('--due') + ';font-size:18px;font-weight:bold;">' + formatTime(remaining) + '</span>';
                submitBtn.disabled = true;
            } else {
                cooldownDisplay.style.display = 'none';
                submitBtn.disabled = false;
                updateSpamStatus({ lastSpam: null, spammedBy: null, completedForums: [], inProgress: false, allCompleted: false }, function() {});
            }
        }

        function updateUIBasedOnStatus(record) {
            var completedForums = record && record.completedForums ? record.completedForums : [];
            grid.querySelectorAll('.forum-checkbox-limited').forEach(function(cb) {
                var isCompleted = completedForums.indexOf(parseInt(cb.value)) !== -1;
                cb.disabled = isCompleted;
                cb.parentElement.parentElement.style.opacity        = isCompleted ? '0.5' : '1';
                cb.parentElement.parentElement.style.pointerEvents  = isCompleted ? 'none' : 'auto';
            });
        }

        function startCountdownLoop() {
            if (countdownInterval) clearInterval(countdownInterval);
            checkSpamStatus(function(record) {
                updateCountdown(record);
                updateUIBasedOnStatus(record);
                countdownInterval = setInterval(function() {
                    checkSpamStatus(function(record) {
                        updateCountdown(record);
                        updateUIBasedOnStatus(record);
                    });
                }, 1000);
            });
        }

        // -----------------------------------------------
        //  FORUM GRID
        // -----------------------------------------------
        for (var i = 0; i < forums.length; i++) {
            var div = document.createElement('div');
            div.className = 'forum-item';
            div.id        = 'forum-limited-' + i;
            div.innerHTML = '<label><input type="checkbox" value="' + i + '" class="forum-checkbox-limited">'
                          + forums[i].name + '</label><span class="status-badge"></span>';
            grid.appendChild(div);
        }

        grid.querySelectorAll('.forum-checkbox-limited').forEach(function(cb) {
            cb.addEventListener('change', function() {
                this.parentElement.parentElement.classList.toggle('checked', this.checked);
            });
        });

        document.getElementById('selectAllLimited').addEventListener('click', function() {
            if (isRunning) return;
            grid.querySelectorAll('.forum-checkbox-limited').forEach(function(cb) {
                if (!cb.disabled) { cb.checked = true; cb.parentElement.parentElement.classList.add('checked'); }
            });
        });

        document.getElementById('deselectAllLimited').addEventListener('click', function() {
            if (isRunning) return;
            grid.querySelectorAll('.forum-checkbox-limited').forEach(function(cb) {
                if (!cb.disabled) { cb.checked = false; cb.parentElement.parentElement.classList.remove('checked'); }
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
        //  JSONBIN
        // -----------------------------------------------
        function checkSpamStatus(callback) {
            fetch(API_URL + '/latest', {
                method: 'GET',
                headers: { 'X-Master-Key': API_KEY }
            })
            .then(function(r) { return r.json(); })
            .then(function(response) { callback(response.record); })
            .catch(function(e) { console.error('[SpamLimited] checkSpamStatus:', e); });
        }

        function updateSpamStatus(data, callback) {
            fetch(API_URL, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Master-Key': API_KEY
                },
                body: JSON.stringify(data)
            })
            .then(function(r) { callback(r.ok); })
            .catch(function(e) { console.error('[SpamLimited] updateSpamStatus:', e); callback(false); });
        }

        // -----------------------------------------------
        //  COOLDOWN HELPERS
        // -----------------------------------------------
        function getRemainingTime(lastSpamDate) {
            var remaining = (cooldownMinutes * 60 * 1000) - (Date.now() - new Date(lastSpamDate).getTime());
            return remaining > 0 ? remaining : 0;
        }

        function formatTime(ms) {
            var s  = Math.floor(ms / 1000);
            var m  = Math.floor(s / 60);
            var h  = Math.floor(m / 60);
            var d  = Math.floor(h / 24);
            if (d > 0)  return d + 'd ' + (h % 24) + 'h ' + (m % 60) + 'm';
            if (h > 0)  return h + 'h ' + (m % 60) + 'm ' + (s % 60) + 's';
            if (m > 0)  return m + 'm ' + (s % 60) + 's';
            return s + 's';
        }

        // -----------------------------------------------
        //  UI UPDATE
        // -----------------------------------------------
        function updateCountdown(record) {
            if (record && record.spammedBy) {
                var date = record.lastSpam ? new Date(record.lastSpam).toLocaleString('it-IT') : 'in corso...';
                lastUserDiv.innerHTML = 'Ultimo spam: <strong>' + record.spammedBy + '</strong> il ' + date;
                lastUserDiv.style.display = 'block';
            }

            if (record && record.inProgress && !isRunning) {
                submitBtn.disabled = true;
                cooldownDisplay.style.display = 'block';
                cooldownDisplay.innerHTML = '<strong style="color:' + cssVar('--sei') + ';">Spam in corso</strong><br>'
                    + '<strong>' + record.spammedBy + '</strong> sta già effettuando lo spam. Attendi che finisca.';
                return;
            }

            if (!record || !record.lastSpam || !record.allCompleted) {
                cooldownDisplay.style.display = 'none';
                if (!isRunning) submitBtn.disabled = !!(record && record.inProgress);
                return;
            }

            var remaining = getRemainingTime(record.lastSpam);
            if (remaining > 0) {
                cooldownDisplay.style.display = 'block';
                cooldownDisplay.innerHTML = '<strong style="color:' + cssVar('--sei') + ';">Spam bloccato</strong><br>'
                    + 'Ultimo spam da <strong>' + record.spammedBy + '</strong> il ' + new Date(record.lastSpam).toLocaleString('it-IT') + '<br>'
                    + 'Tempo rimanente: <span style="color:' + cssVar('--due') + ';font-size:18px;font-weight:bold;">' + formatTime(remaining) + '</span>';
                submitBtn.disabled = true;
            } else {
                cooldownDisplay.style.display = 'none';
                submitBtn.disabled = false;
                updateSpamStatus({ lastSpam: null, spammedBy: null, completedForums: [], inProgress: false, allCompleted: false }, function() {});
            }
        }

        function updateUIBasedOnStatus(record) {
            var completedForums = record && record.completedForums ? record.completedForums : [];
            grid.querySelectorAll('.forum-checkbox-limited').forEach(function(cb) {
                var isCompleted = completedForums.indexOf(parseInt(cb.value)) !== -1;
                cb.disabled = isCompleted;
                cb.parentElement.parentElement.style.opacity        = isCompleted ? '0.5' : '1';
                cb.parentElement.parentElement.style.pointerEvents  = isCompleted ? 'none' : 'auto';
            });
        }

        function startCountdownLoop() {
            if (countdownInterval) clearInterval(countdownInterval);
            checkSpamStatus(function(record) {
                updateCountdown(record);
                updateUIBasedOnStatus(record);
                countdownInterval = setInterval(function() {
                    checkSpamStatus(function(record) {
                        updateCountdown(record);
                        updateUIBasedOnStatus(record);
                    });
                }, 1000);
            });
        }

        // -----------------------------------------------
        //  FORUM GRID
        // -----------------------------------------------
        for (var i = 0; i < forums.length; i++) {
            var div = document.createElement('div');
            div.className = 'forum-item';
            div.id        = 'forum-limited-' + i;
            div.innerHTML = '<label><input type="checkbox" value="' + i + '" class="forum-checkbox-limited">'
                          + forums[i].name + '</label><span class="status-badge"></span>';
            grid.appendChild(div);
        }

        grid.querySelectorAll('.forum-checkbox-limited').forEach(function(cb) {
            cb.addEventListener('change', function() {
                this.parentElement.parentElement.classList.toggle('checked', this.checked);
            });
        });

        document.getElementById('selectAllLimited').addEventListener('click', function() {
            if (isRunning) return;
            grid.querySelectorAll('.forum-checkbox-limited').forEach(function(cb) {
                if (!cb.disabled) { cb.checked = true; cb.parentElement.parentElement.classList.add('checked'); }
            });
        });

        document.getElementById('deselectAllLimited').addEventListener('click', function() {
            if (isRunning) return;
            grid.querySelectorAll('.forum-checkbox-limited').forEach(function(cb) {
                if (!cb.disabled) { cb.checked = false; cb.parentElement.parentElement.classList.remove('checked'); }
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
            var escapedMsg = rewardMessage.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

            var popupScript = '(function() {'
                + '  fetch(location.href)'
                + '    .then(function(r) { return r.text(); })'
                + '    .then(function(html) {'
                + '      var marker = \'name="s" value="\';'
                + '      var start = html.indexOf(marker);'
                + '      if (start === -1) { window.close(); return; }'
                + '      start += marker.length;'
                + '      var token = html.substring(start, html.indexOf(\'"\', start));'
                + '      var fd = new FormData();'
                + '      fd.set(\'st\', \'0\');'
                + '      fd.set(\'act\', \'Post\');'
                + '      fd.set(\'s\', token);'
                + '      fd.set(\'CODE\', \'03\');'
                + '      fd.set(\'f\', \'' + rewardForum.f + '\');'
                + '      fd.set(\'t\', \'' + rewardForum.t + '\');'
                + '      fd.set(\'Post\', \'' + escapedMsg + '\');'
                + '      fd.set(\'charset\', \'UTF-8\');'
                + '      return fetch(location.origin + \'/\', { method: \'POST\', body: fd });'
                + '    })'
                + '    .catch(function(e) { console.error(e); });'
                + '})();';

            var formHtml = '<!DOCTYPE html><body>'
                + '<p>Pubblicazione ricompensa...</p>'
                + '<scr' + 'ipt type="text/javascript">' + popupScript + '</' + 'script>';

            var w = window.open('', 'reward' + Math.random().toString(36).substring(7), 'width=800,height=600');
            if (w) { w.document.write(formHtml); w.document.close(); }
        }

        // -----------------------------------------------
        //  CSS VAR HELPER
        // -----------------------------------------------
        function cssVar(name) {
            return getComputedStyle(document.documentElement).getPropertyValue(name);
        }

        // -----------------------------------------------
        //  JSONBIN
        // -----------------------------------------------
        function checkSpamStatus(callback) {
            fetch(API_URL + '/latest', {
                method: 'GET',
                headers: { 'X-Master-Key': API_KEY }
            })
            .then(function(r) { return r.json(); })
            .then(function(response) { callback(response.record); })
            .catch(function(e) { console.error('[SpamLimited] checkSpamStatus:', e); });
        }

        function updateSpamStatus(data, callback) {
            fetch(API_URL, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Master-Key': API_KEY
                },
                body: JSON.stringify(data)
            })
            .then(function(r) { callback(r.ok); })
            .catch(function(e) { console.error('[SpamLimited] updateSpamStatus:', e); callback(false); });
        }

        // -----------------------------------------------
        //  COOLDOWN HELPERS
        // -----------------------------------------------
        function getRemainingTime(lastSpamDate) {
            var remaining = (cooldownMinutes * 60 * 1000) - (Date.now() - new Date(lastSpamDate).getTime());
            return remaining > 0 ? remaining : 0;
        }

        function formatTime(ms) {
            var s  = Math.floor(ms / 1000);
            var m  = Math.floor(s / 60);
            var h  = Math.floor(m / 60);
            var d  = Math.floor(h / 24);
            if (d > 0)  return d + 'd ' + (h % 24) + 'h ' + (m % 60) + 'm';
            if (h > 0)  return h + 'h ' + (m % 60) + 'm ' + (s % 60) + 's';
            if (m > 0)  return m + 'm ' + (s % 60) + 's';
            return s + 's';
        }

        // -----------------------------------------------
        //  UI UPDATE
        // -----------------------------------------------
        function updateCountdown(record) {
            if (record && record.spammedBy) {
                var date = record.lastSpam ? new Date(record.lastSpam).toLocaleString('it-IT') : 'in corso...';
                lastUserDiv.innerHTML = 'Ultimo spam: <strong>' + record.spammedBy + '</strong> il ' + date;
                lastUserDiv.style.display = 'block';
            }

            if (record && record.inProgress && !isRunning) {
                submitBtn.disabled = true;
                cooldownDisplay.style.display = 'block';
                cooldownDisplay.innerHTML = '<strong style="color:' + cssVar('--sei') + ';">Spam in corso</strong><br>'
                    + '<strong>' + record.spammedBy + '</strong> sta già effettuando lo spam. Attendi che finisca.';
                return;
            }

            if (!record || !record.lastSpam || !record.allCompleted) {
                cooldownDisplay.style.display = 'none';
                if (!isRunning) submitBtn.disabled = !!(record && record.inProgress);
                return;
            }

            var remaining = getRemainingTime(record.lastSpam);
            if (remaining > 0) {
                cooldownDisplay.style.display = 'block';
                cooldownDisplay.innerHTML = '<strong style="color:' + cssVar('--sei') + ';">Spam bloccato</strong><br>'
                    + 'Ultimo spam da <strong>' + record.spammedBy + '</strong> il ' + new Date(record.lastSpam).toLocaleString('it-IT') + '<br>'
                    + 'Tempo rimanente: <span style="color:' + cssVar('--due') + ';font-size:18px;font-weight:bold;">' + formatTime(remaining) + '</span>';
                submitBtn.disabled = true;
            } else {
                cooldownDisplay.style.display = 'none';
                submitBtn.disabled = false;
                updateSpamStatus({ lastSpam: null, spammedBy: null, completedForums: [], inProgress: false, allCompleted: false }, function() {});
            }
        }

        function updateUIBasedOnStatus(record) {
            var completedForums = record && record.completedForums ? record.completedForums : [];
            grid.querySelectorAll('.forum-checkbox-limited').forEach(function(cb) {
                var isCompleted = completedForums.indexOf(parseInt(cb.value)) !== -1;
                cb.disabled = isCompleted;
                cb.parentElement.parentElement.style.opacity        = isCompleted ? '0.5' : '1';
                cb.parentElement.parentElement.style.pointerEvents  = isCompleted ? 'none' : 'auto';
            });
        }

        function startCountdownLoop() {
            if (countdownInterval) clearInterval(countdownInterval);
            checkSpamStatus(function(record) {
                updateCountdown(record);
                updateUIBasedOnStatus(record);
                countdownInterval = setInterval(function() {
                    checkSpamStatus(function(record) {
                        updateCountdown(record);
                        updateUIBasedOnStatus(record);
                    });
                }, 1000);
            });
        }

        // -----------------------------------------------
        //  FORUM GRID
        // -----------------------------------------------
        for (var i = 0; i < forums.length; i++) {
            var div = document.createElement('div');
            div.className = 'forum-item';
            div.id        = 'forum-limited-' + i;
            div.innerHTML = '<label><input type="checkbox" value="' + i + '" class="forum-checkbox-limited">'
                          + forums[i].name + '</label><span class="status-badge"></span>';
            grid.appendChild(div);
        }

        grid.querySelectorAll('.forum-checkbox-limited').forEach(function(cb) {
            cb.addEventListener('change', function() {
                this.parentElement.parentElement.classList.toggle('checked', this.checked);
            });
        });

        document.getElementById('selectAllLimited').addEventListener('click', function() {
            if (isRunning) return;
            grid.querySelectorAll('.forum-checkbox-limited').forEach(function(cb) {
                if (!cb.disabled) { cb.checked = true; cb.parentElement.parentElement.classList.add('checked'); }
            });
        });

        document.getElementById('deselectAllLimited').addEventListener('click', function() {
            if (isRunning) return;
            grid.querySelectorAll('.forum-checkbox-limited').forEach(function(cb) {
                if (!cb.disabled) { cb.checked = false; cb.parentElement.parentElement.classList.remove('checked'); }
            });
        });

        // -----------------------------------------------
        //  SUBMIT A FORUM (popup)
        // -----------------------------------------------
        function submitToForum(forum) {
            var escapedMsg = spamMessage.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

            var popupScript = '(function() {'
                + '  fetch(location.href)'
                + '    .then(function(r) { return r.text(); })'
                + '    .then(function(html) {'
                + '      var marker = \'name="s" value="\';'
                + '      var start = html.indexOf(marker);'
                + '      if (start === -1) { window.close(); return; }'
                + '      start += marker.length;'
                + '      var token = html.substring(start, html.indexOf(\'"\', start));'
                + '      var fd = new FormData();'
                + '      fd.set(\'st\', \'0\');'
                + '      fd.set(\'act\', \'Post\');'
                + '      fd.set(\'s\', token);'
                + '      fd.set(\'CODE\', \'03\');'
                + '      fd.set(\'f\', \'' + forum.f + '\');'
                + '      fd.set(\'t\', \'' + forum.t + '\');'
                + '      fd.set(\'Post\', \'' + escapedMsg + '\');'
                + '      fd.set(\'charset\', \'UTF-8\');'
                + '      return fetch(location.origin + \'/\', { method: \'POST\', body: fd });'
                + '    })'
                + '    .catch(function(e) { console.error(e); });'
                + '})();';

            var formHtml = '<!DOCTYPE html><body>'
                + '<p>Uppando ' + forum.name + '...</p>'
                + '<scr' + 'ipt type="text/javascript">' + popupScript + '</' + 'script>';

            var w = window.open('', 'forum' + Math.random().toString(36).substring(7), 'width=800,height=600');
            if (w) { w.document.write(formHtml); w.document.close(); return true; }
            return false;
        }

        function submitReward(completedForums) {
            var forumList = completedForums.map(function(idx) {
                return '<b>' + forums[idx].name + '</b>';
            }).join(', ');

            var rewardMessage = rewardMessageTemplate.replace('{forumList}', forumList);

            var formHtml = '<!DOCTYPE html><body>'
                + '<form id="rewardForm" method="post" action="' + rewardForum.url + '">'
                + '<input type="hidden" name="st" value="0">'
                + '<input type="hidden" name="act" value="Post">'
                + '<input type="hidden" name="f" value="' + rewardForum.f + '">'
                + '<input type="hidden" name="CODE" value="03">'
                + '<input type="hidden" name="t" value="' + rewardForum.t + '">'
                + '<input type="hidden" name="Post" value="' + rewardMessage.replace(/"/g, '&quot;') + '">'
                + '<input type="submit" id="btnReward" value="Invia">'
                + '</form>'
                + '<scr' + 'ipt type="text/javascript">'
                + 'setTimeout(function() {'
                + '  var btn = document.getElementById("btnReward");'
                + '  if (btn) { var e = document.createEvent("MouseEvents"); e.initEvent("click",true,true); btn.dispatchEvent(e); }'
                + '}, 500);'
                + '</' + 'script>';

            var w = window.open('', 'reward' + Math.random().toString(36).substring(7), 'width=800,height=600');
            if (w) { w.document.write(formHtml); w.document.close(); }
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
            checkSpamStatus(function(record) {
                if (record && record.inProgress) {
                    alert('Spam in corso!\n\n' + record.spammedBy + ' sta già effettuando lo spam. Attendi che finisca.');
                    return;
                }

                if (record && record.lastSpam && record.allCompleted) {
                    var remaining = getRemainingTime(record.lastSpam);
                    if (remaining > 0) {
                        alert('Spam bloccato!\n\n' + record.spammedBy + ' ha già spammato il ' + new Date(record.lastSpam).toLocaleString('it-IT') + '.\n\nTempo rimanente: ' + formatTime(remaining));
                        return;
                    }
                }

                var username = (window.Commons && Commons.user && Commons.user.nickname)
                    ? Commons.user.nickname : null;

                if (!username) {
                    username = prompt('Inserisci il tuo username:');
                    if (!username || !username.trim()) { alert('Username richiesto per continuare'); return; }
                    username = username.trim();
                }

                var selected = [];
                grid.querySelectorAll('.forum-checkbox-limited:checked').forEach(function(cb) {
                    selected.push(parseInt(cb.value));
                });

                if (selected.length === 0) { alert('Seleziona almeno un forum!'); return; }

                if (!confirm('Vuoi uppare ' + selected.length + ' forum?\n\nVerranno aperte ' + selected.length + ' nuove finestre con un intervallo di 20 secondi.\n\nAssicurati di aver autorizzato i popup!')) return;

                var completedForums = record && record.completedForums ? record.completedForums : [];

                updateSpamStatus({
                    lastSpam:        null,
                    spammedBy:       username,
                    completedForums: completedForums,
                    inProgress:      true,
                    allCompleted:    false
                }, function(success) {
                    if (!success) { alert('Errore nel registrare lo spam. Riprova.'); return; }

                    startCountdownLoop();

                    isRunning  = true;
                    shouldStop = false;
                    submitBtn.disabled = true;
                    stopBtn.classList.add('show');
                    status.classList.add('show');

                    grid.querySelectorAll('.forum-checkbox-limited').forEach(function(cb) { cb.disabled = true; });
                    grid.querySelectorAll('.forum-item').forEach(function(item) {
                        item.classList.remove('processing', 'done');
                        item.querySelector('.status-badge').textContent = '';
                    });

                    var currentIndex = 0;
                    var hadError     = false;

                    function resetUI() {
                        isRunning = false;
                        stopBtn.classList.remove('show');
                    }

                    function allForumsCompleted() {
                        return forums.every(function(_, j) { return completedForums.indexOf(j) !== -1; });
                    }

                    function processNext() {
                        if (currentIndex >= selected.length || shouldStop) {
                            var allDone = allForumsCompleted();

                            if (!shouldStop && !hadError && allDone) {
                                updateSpamStatus({
                                    lastSpam:        new Date().toISOString(),
                                    spammedBy:       username,
                                    completedForums: completedForums,
                                    inProgress:      false,
                                    allCompleted:    true
                                }, function(success) {
                                    if (!success) return;
                                    progressBar.style.width = '100%';
                                    progressBar.textContent = '100%';

                                    var countdown = 20;
                                    var countInterval = setInterval(function() {
                                        if (countdown > 0) {
                                            statusText.innerHTML = '<strong style="color:' + cssVar('--sette') + ';">Completato! Pubblicazione ricompensa tra <span style="color:' + cssVar('--due') + ';font-size:18px;">' + countdown + '</span> secondi...</strong>';
                                            countdown--;
                                        } else {
                                            clearInterval(countInterval);
                                            submitReward(completedForums);
                                            statusText.innerHTML = '<strong style="color:' + cssVar('--sette') + ';">Completato! Ricompensa pubblicata.</strong><br><small>Puoi chiudere le finestre aperte.</small>';
                                            startCountdownLoop();
                                        }
                                    }, 1000);
                                });

                            } else if (!shouldStop && !hadError && !allDone) {
                                updateSpamStatus({
                                    lastSpam:        null,
                                    spammedBy:       username,
                                    completedForums: completedForums,
                                    inProgress:      false,
                                    allCompleted:    false
                                }, function() {
                                    progressBar.style.width = '100%';
                                    progressBar.textContent = '100%';
                                    statusText.innerHTML = '<strong style="color:' + cssVar('--sei') + ';">Completato, ma non avendo uppato tutti i forum (' + completedForums.length + '/' + forums.length + '), non è possibile richiedere le ricompense.</strong>';
                                    startCountdownLoop();
                                });

                            } else {
                                updateSpamStatus({
                                    lastSpam:        null,
                                    spammedBy:       username,
                                    completedForums: completedForums,
                                    inProgress:      false,
                                    allCompleted:    false
                                }, function() {
                                    statusText.innerHTML = '<strong style="color:' + cssVar('--sei') + ';">'
                                        + (hadError ? 'Processo interrotto per errore.' : 'Processo interrotto.')
                                        + ' Alcuni forum non sono stati uppati.</strong>';
                                    startCountdownLoop();
                                });
                            }

                            resetUI();
                            return;
                        }

                        var forumIndex = selected[currentIndex];
                        var forum      = forums[forumIndex];
                        var forumEl    = document.getElementById('forum-limited-' + forumIndex);
                        var progress   = Math.round(((currentIndex + 1) / selected.length) * 100);

                        forumEl.classList.add('processing');
                        forumEl.querySelector('.status-badge').textContent = '';
                        progressBar.style.width = progress + '%';
                        progressBar.textContent = progress + '%';
                        statusText.innerHTML = '<strong>Uppando ' + forum.name + '...</strong> (' + (currentIndex + 1) + '/' + selected.length + ')';

                        if (!submitToForum(forum)) {
                            hadError   = true;
                            shouldStop = true;
                            alert('Popup bloccato! Autorizza i popup e riprova.');
                            processNext();
                            return;
                        }

                        if (completedForums.indexOf(forumIndex) === -1) completedForums.push(forumIndex);

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
            });
        });

        startCountdownLoop();

        }); // fine waitFor

})();
