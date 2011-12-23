
default: help

pull-libraries:
	curl https://www.google.com/css/go-x.css > lib/css/go-x.css
	curl https://www.google.com/css/go.css > lib/css/go.css

optimize:
	node build/r.js -o belay/build.js
	@echo 'Staging - do not use the output of this rule'

lint: lint-js

lint-js:
	gjslint --nojsdoc $(admin/projectfiles | grep '.js$')

check-notices:
	@admin/projectfiles | xargs admin/check-notice | sort

help:
	@echo 'make lint-js        -- runs the linter on js files'
	@echo 'make check-notices  -- checks for copyright notices'
	@echo 'make pull-libraries -- updates third party libraries'

