import gulp from 'gulp';
import {create as bsCreate} from 'browser-sync';
import gulpSass from 'gulp-sass';
import del from 'del';
import sassCompiler from 'sass';
import htmlmin from 'gulp-htmlmin';
import webpack from 'webpack-stream';
import cleanCss from 'gulp-cleancss';
import yargs from 'yargs';
import {hideBin} from 'yargs/helpers';
import packageFile from './package.json';
import critical from 'critical';
import merge from 'gulp-merge-json';
import stripComments from 'gulp-strip-json-comments';
import favicons from 'gulp-favicons';
import through from 'through2';
import fileinclude from 'gulp-file-include';
import gulpPlumber from 'gulp-plumber';

/**
 * Create browsersync object.
 */
const browserSync = bsCreate();

/**
 * Build config from package.json.
 */
const config = (() => {
  const config = packageFile.build;

  // Create globs for scripts.
  config.sourceGlobs = [];
  config.distGlobs = [];
  config.sourceGlobs.script = [];
  config.distGlobs.script = [];
  config.script.forEach((glob) => {
    config.sourceGlobs.script.push(config.source + glob);
    config.distGlobs.script.push(config.dist + glob);
  });

  /**
   * Inverts a glob array from include to exclude.
   * @param {String[]} globArray Array of globs
   * @return {String[]} Inverted array of globs
   */
  const invertGlob = (globArray) => {
    return globArray.map((glob) => {
      return '!' + glob;
    });
  };

  // Create globs for html.
  config.sourceGlobs.html = [];
  config.distGlobs.html = [];
  config.html.forEach((glob) => {
    config.sourceGlobs.html.push(config.source + glob);
    config.distGlobs.html.push(config.dist + glob);
  });

  // Create globs for partials.
  config.sourceGlobs.partials = [];
  config.partials.forEach((glob) => {
    config.sourceGlobs.partials.push(config.source + glob);
  });

  // Create globs for scss.
  config.sourceGlobs.scss = [];
  config.distGlobs.scss = [];
  config.scss.forEach((glob) => {
    config.sourceGlobs.scss.push(config.source + glob);
    config.distGlobs.scss.push(config.dist + glob);
  });

  // Create the glob for the favicon.
  config.sourceGlobs.favicon = [config.source + config.favicon];
  config.distGlobs.favicon = [config.dist + '/favicons/*'];

  // Create globs for files.
  config.sourceGlobs.file = [];
  config.distGlobs.file = [];
  config.sourceGlobs.file.push(...invertGlob(config.sourceGlobs.script));
  config.sourceGlobs.file.push(...invertGlob(config.sourceGlobs.html));
  config.sourceGlobs.file.push(...invertGlob(config.sourceGlobs.scss));
  config.sourceGlobs.file.push(...invertGlob(config.sourceGlobs.favicon));
  config.distGlobs.file.push(...invertGlob(config.distGlobs.script));
  config.distGlobs.file.push(...invertGlob(config.distGlobs.html));
  config.distGlobs.file.push(...invertGlob(config.distGlobs.scss));
  config.distGlobs.file.push(...invertGlob(config.distGlobs.favicon));
  config.file.forEach((glob) => {
    config.sourceGlobs.file.unshift(config.source + glob);
    config.distGlobs.file.unshift(config.dist + glob);
  });

  // Add full paths to h5ai config.
  config.h5aiConfig.dist = config.dist + config.h5aiConfig.dist;
  config.h5aiConfig.configDir = config.h5aiConfig.dist +
      config.h5aiConfig.configDir;

  // Add exclusions for favicons.
  config.distGlobs.script.push(...invertGlob(config.distGlobs.favicon));
  config.distGlobs.html.push(...invertGlob(config.distGlobs.favicon));
  config.distGlobs.scss.push(...invertGlob(config.distGlobs.favicon));
  config.distGlobs.file.push(...invertGlob(config.distGlobs.favicon));

  // Add exclusions for h5ai.
  config.distGlobs.script.push(...invertGlob([config.h5aiConfig.dist + '/*']));
  config.distGlobs.html.push(...invertGlob([config.h5aiConfig.dist + '/*']));
  config.distGlobs.scss.push(...invertGlob([config.h5aiConfig.dist + '/*']));
  config.distGlobs.file.push(...invertGlob([config.h5aiConfig.dist + '/*']));
  config.distGlobs.favicon.push(...invertGlob([config.h5aiConfig.dist + '/*']));

  // Add exclusions for partials.
  config.partials.forEach((glob) => {
    config.sourceGlobs.html.push(...invertGlob([config.source + glob]));
  });

  return config;
})();

/**
 * isProd true if production build.
 */
const {prod: isProd} = yargs(hideBin(process.argv)).argv;

/**
 * Effectively removes callback function added by gulp.
 * @param {Function} func Function to execute
 * @param  {...any} args Function arguments
 * @return {Function} Function to run task with arguments.
 */
const taskCreator = (func, ...args) => {
  const f = () => {
    return func(...args);
  };

  Object.defineProperty(f, 'name', {
    value: func.name,
    writable: false,
  });

  return f;
};

/**
 * Cleans directory of files.
 * @param {String | String[]} source Glob to clean
 * @return {NodeJS.ReadWriteStream} Node stream
 */
const clean = (source = config.dist + '/*') => {
  return del((source), {dot: true});
};

/**
 * Callable task function for clean.
 */
const cleanTask = taskCreator(clean);

/**
 * Creates JavaScript files via webpack.
 * @param {String | String[]} source Glob of file to source
 * @return {NodeJS.ReadWriteStream} Node stream
 */
const script = (source = config.sourceGlobs.script) => {
  return gulp.src(source)
      .pipe(webpack({
        mode: isProd ? 'production' : 'development',
        devtool: isProd ? undefined : 'cheap-source-map',
      }, null, (err) => {
        if (err) {
          console.log(err);
        }
      }))
      .pipe(gulp.dest(config.dist));
};

/**
 * Creates and minifies css files via sass.
 * @param {String | String[]} source Glob of files to source
 * @return {NodeJS.ReadWriteStream} Node stream
 */
const scss = (source = config.sourceGlobs.scss) => {
  return gulp.src(source)
      .pipe(gulpSass(sassCompiler)({
        includePaths: ['node_modules'],
      }))
      .pipe(cleanCss())
      .pipe(gulp.dest(config.dist));
};

/**
 * Sources HTML files, does critical CSS analysis,
 * minifies them, and writes them to dist folder.
 * @param {String | String[]} source Glob of files
 * @return {Node.ReadWriteStream} Node stream
 */
const html = (source = config.sourceGlobs.html) => {
  return gulp.src(source, {base: config.src})
      .pipe(gulpPlumber())
      .pipe(fileinclude({
        basepath: config.source,
      }))
      .pipe(fileinclude({
        basepath: config.dist,
        prefix: '%%',
      }))
      .pipe(gulpPlumber.stop())
      .pipe(critical.stream({
        base: './dist',
        inline: true,
        extract: true,
      }))
      .pipe(htmlmin({collapseWhitespace: true}))
      .on('error', console.log)
      .pipe(through.obj( function( file, _enc, cb ) {
        const date = new Date();
        file.stat.atime = date;
        file.stat.mtime = date;
        cb( null, file );
      }))
      .pipe(gulp.dest(config.dist));
};

/**
 * Sources and copies files not sourced by scripts, styles, or html to dist
 * folder.
 * @param {String | String[]} source Path of files to source
 * @return {NodeJS.ReadWriteStream} Node stream
 */
const file = (source = config.sourceGlobs.file) => {
  return gulp.src(source, {dot: true, nodir: true})
      .pipe(gulp.dest(config.dist));
};

/**
 * Generates favicon files.
 * @param {String | String[]} source glob for favicon file
 * @return {NodeJS.ReadWriteStream} Node stream
 */
const favicon = (source = config.sourceGlobs.favicon) => {
  return gulp.src(source)
      .pipe(
          favicons({
            ...config.faviconConfig,
            path: '/favicons/',
            scope: '/',
            version: packageFile.version,
            logging: false,
            html: 'favicons.html',
            pipeHTML: true,
            replace: true,
          }),
      )
      .on('error', console.log)
      .pipe(gulp.dest(config.dist + '/favicons/'));
};

/**
 * Removes unused favicon file after build.
 * @return {NodeJS.ReadWriteStream} Node stream
 */
const faviconPost = () => {
  if (isProd) {
    return del((config.dist + '/favicons/favicons.html'));
  } else {
    return Promise.resolve();
  }
};

/**
 * Sources and copies h5ai files.
 * @param {String | String[]} source Path of files to source
 * @return {NodeJS.ReadWriteStream} Node stream
 */
const h5ai = (source = config.h5aiConfig.source) => {
  return gulp.src(source, {dot: true})
      .pipe(gulp.dest(config.h5aiConfig.dist));
};

/**
 * Overrides certain h5ai config values.
 * @param {String | String[]} source Path of config file
 * @return {NodeJS.ReadWriteStream} Node stream
 */
const h5aiConfigOverride = (source =
config.h5aiConfig.configDir + '/' + config.h5aiConfig.configFile) => {
  return gulp.src(source)
      .pipe(stripComments())
      .pipe(merge({
        endObj: config.h5aiConfig.configOverrides,
        fileName: config.h5aiConfig.configFile,
      }))
      .pipe(gulp.dest(config.h5aiConfig.configDir));
};

/**
 * Runs build functions.
 * @return {Node.ReadWriteStream} Node stream
 */
export const build = gulp.series(
    cleanTask,
    gulp.parallel(
        gulp.series(
            gulp.parallel(
                taskCreator(favicon),
                taskCreator(scss),
            ),
            taskCreator(html),
            taskCreator(faviconPost),
        ),
        gulp.series(
            taskCreator(h5ai),
            taskCreator(h5aiConfigOverride),
        ),
        taskCreator(script),
        taskCreator(file),
    ),
);

/**
 * Starts browsersync serve and watch functions.
 * @return {Promise} Resolved promise
 */
const browserSyncInit = () => {
  browserSync.init({
    server: config.dist,
    open: false,
    files: [config.dist + '/!(*.css)'],
    listen: '::1',
    middleware: (_req, res, next) => {
      res.setHeader('cache-control', 'max-age=0; no-cache');
      next();
    },
  });
  return Promise.resolve();
};

/**
 * Starts watching for changed files.
 * @return {Promise} Resolved promise
 */
const startWatch = () => {
  gulp.watch(config.sourceGlobs.script, taskCreator(change))
      .on('add', script)
      .on('change', script)
      .on('unlink', gulp.series(
          taskCreator(clean, config.distGlobs.script),
          taskCreator(script)));

  gulp.watch(config.sourceGlobs.file, taskCreator(change))
      .on('add', file)
      .on('change', file)
      .on('unlink', gulp.series(
          taskCreator(clean, config.distGlobs.file),
          taskCreator(file)));

  const htmlAndScss = gulp.series(
      taskCreator(clean, config.distGlobs.html),
      taskCreator(clean, config.distGlobs.scss),
      taskCreator(scss),
      taskCreator(html),
  );

  const faviconAndHtml = gulp.series(
      taskCreator(clean, config.distGlobs.html),
      taskCreator(clean, config.distGlobs.favicon),
      taskCreator(favicon),
      taskCreator(html),
  );

  gulp.watch(config.sourceGlobs.favicon, taskCreator(change))
      .on('add', faviconAndHtml)
      .on('change', faviconAndHtml)
      .on('unlink', faviconAndHtml);

  gulp.watch(config.sourceGlobs.partials, taskCreator(change))
      .on('add', htmlAndScss)
      .on('change', htmlAndScss)
      .on('unlink', htmlAndScss);

  gulp.watch(config.sourceGlobs.html, taskCreator(change))
      .on('add', html)
      .on('change', html)
      .on('unlink', htmlAndScss);

  gulp.watch(config.sourceGlobs.scss, taskCreator(change))
      .on('add', htmlAndScss)
      .on('change', htmlAndScss)
      .on('unlink', htmlAndScss);

  return Promise.resolve();
};

/**
 * Logs that a file change was detected.
 * @return {Promise} Resolved promise
 */
const change = () => {
  console.log('File changed, processing.');
  return Promise.resolve();
};

/**
 * Runs build function, then watches for file changes.
 * @return {Node.ReadWriteStream} Node stream
 */
export const start = gulp.series(
    build,
    taskCreator(browserSyncInit),
    taskCreator(startWatch),
);

export {cleanTask as clean};
export default build;
