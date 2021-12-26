import gulp from 'gulp';
import {create as bsCreate} from 'browser-sync';
import gulpSass from 'gulp-sass';
import del from 'del';
import sassCompiler from 'sass';
import htmlmin from 'gulp-htmlmin';
import webpack from 'webpack-stream';
import rename from 'gulp-rename';
import cleanCss from 'gulp-cleancss';
import concat from 'gulp-concat';
import yargs from 'yargs';
import {hideBin} from 'yargs/helpers';
import packageFile from './package.json';

/**
 * Browsersync instance.
 */
const browserSync = bsCreate();

/**
 * SASS compiler.
 */
const sass = gulpSass(sassCompiler);

/**
 * Build config from package.json.
 */
const config = packageFile.build;

/*
 * Add script, style, and html globs as excludes
 * to files.
 */
config.files.push('!' + config.js);
config.files.push('!' + config.scss);
config.files.push('!' + config.html);
config.distFiles.push('!' + config.distJs);
config.distFiles.push('!' + config.distScss);
config.distFiles.push('!' + config.distHtml);

/**
 * True if production build.
 */
const {prod: isProd} = yargs(hideBin(process.argv)).argv;

/**
 * Cleans dist directory of all files.
 * @return {NodeJS.ReadWriteStream} Node stream
 */
export const clean = () => {
  return del((config.dist + '/*'), {dot: true});
};

/**
 * Creates JavaScript bundles via webpack.
 * @param {Object} bundle bundle to create
 * @param {String | String[]} bundle.src Path of file to source
 * @param {String} bundle.name Name of bundle
 * @return {NodeJS.ReadWriteStream} Node stream
 */
const script = ({src, name}) => {
  const webpackOptions = {
    mode: isProd ? 'production' : 'development',
    output: {filename: `${name}.js`},
    devtool: isProd ? undefined : 'cheap-source-map',
  };
  return gulp.src(src)
      .pipe(webpack(webpackOptions))
      .pipe(rename((path) => {
        path.dirname = '';
        path.basename = name;
      }))
      .pipe(gulp.dest(config.dist));
};

/**
 * Creates css bundles via SASS.
 * @param {Object} bundle bundle to create
 * @param {String | String[]} bundle.src Path of file to source
 * @param {String} bundle.name Name of bundle
 * @return {NodeJS.ReadWriteStream} Node stream
 */
const style = ({src, name}) => {
  return gulp.src(src)
      .pipe(sass({
        includePaths: ['node_modules'],
      }))
      .pipe(concat(`${name}.css`))
      .pipe(cleanCss())
      .pipe(rename((path) => {
        path.dirname = '';
        path.basename = name;
      }))
      .pipe(gulp.dest(config.dist));
};

/**
 * Sources HTML files, minifies them, and writes them to dist folder.
 * @param {String | String[]} path Path of files to source
 * @return {Node.ReadWriteStream} Node stream
 */
const html = (path) => {
  return gulp.src(path)
      .pipe(htmlmin({collapseWhitespace: true}))
      .pipe(gulp.dest(config.dist));
};

/**
 * Sources and copies files not sourced by scripts, styles, or html to dist
 * folder.
 * @param {string | string[]} path Path of files to source
 * @return {NodeJS.ReadWriteStream} Node stream
 */
const files = (path) => {
  return gulp.src(path, {dot: true, nodir: true})
      .pipe(gulp.dest(config.dist));
};


/**
 * Dynamically names anonymous functions.
 * @param {Function} action Anonymous function that calls another with
 * parameters
 * @param {String} name Name for action
 * @return {Function} Returns a
 */
const dynamicFunc = (action, name) => {
  const f = action;
  Object.defineProperty(f, 'name', {
    value: name,
    writable: false,
  });
  return f;
};

/**
 * Array containing functions for each script bundle.
 */
const scripts = config.js_bundles.map((obj) =>
  dynamicFunc(() => script(obj), `${obj.name}.js`));

/**
 * Array containing functions for each style bundle.
 */
const styles = config.scss_bundles.map((obj) =>
  dynamicFunc(() => style(obj), `${obj.name}.css`));

/**
 * Runs build functions.
 * @return {Node.ReadWriteStream} Node stream
 */
export const build = gulp.series(
    clean,
    gulp.parallel(
        ...scripts,
        ...styles,
        dynamicFunc(() => {
          return html(config.html);
        }, 'html'),
        dynamicFunc(() => {
          return files(config.files);
        }, 'files'),
    ),
);

/**
 * Regenerates HTML files.
 * @returns {Node.ReadWriteStream} Node stream
 */
const regenerateHtml = gulp.series(
    dynamicFunc(() => {
      return del(config.distHtml);
    }, 'cleanHtml'),
    dynamicFunc(() => {
      return html(config.html);
    }, 'html'),
);

/**
 * Regenerates regular files.
 * @returns {Node.ReadWriteStream} Node stream
 */
const regenerateFiles = gulp.series(
    dynamicFunc(() => {
      return del((config.distFiles), {dot: true});
    }, 'cleanFiles'),
    dynamicFunc(() => {
      return files(config.files);
    }, 'files'),
);

/**
 * Logs that a file change was detected.
 */
const change = () => {
  console.log('File changed, processing.');
};

/**
 * Runs build function, then watches for file changes.
 * @return {Node.ReadWriteStream} Node stream
 */
export const start = gulp.series(
    build,
    dynamicFunc(() => {
      browserSync.init({
        server: './dist',
        open: false,
        files: ['./dist/**/*'],
        listen: '::1',
      });
      if (scripts.length) {
        gulp.watch(config.js, gulp.parallel(change, ...scripts));
      }
      if (styles.length) {
        gulp.watch(config.scss, gulp.parallel(change, ...styles));
      }
      gulp.watch(config.html, change)
          .on('add', html)
          .on('change', html)
          .on('unlink', regenerateHtml);
      gulp.watch(config.files, change)
          .on('add', files)
          .on('change', files)
          .on('unlink', regenerateFiles);
    }, 'watch'),
);

export default build;
